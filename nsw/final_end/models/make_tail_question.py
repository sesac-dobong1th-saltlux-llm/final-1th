import faiss
from transformers import AutoTokenizer, AutoModel
from tqdm.auto import tqdm
from langchain_community.document_loaders.csv_loader import CSVLoader
from langchain.llms import HuggingFacePipeline
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
import sys
import pandas as pd
import warnings,logging,gc
import numpy as np
# 경고와 로깅 설정
# 특정 라이브러리 경고 무시
warnings.filterwarnings("ignore", category=FutureWarning, module="huggingface_hub")
warnings.filterwarnings("ignore", category=UserWarning, module="transformers")
logging.basicConfig(level=logging.ERROR)

import torch
from transformers import AutoTokenizer, AutoModel

def initialize_model(model_path, gpu_indices=[1,2,3,4,5,6,7]):
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModel.from_pretrained(model_path)
    if torch.cuda.is_available():
        device = torch.device(f"cuda:{gpu_indices[0]}")
        model = model.to(device)
        model = torch.nn.DataParallel(model, device_ids=gpu_indices)
    else:
        device = torch.device("cpu")
        model = model.to(device)
    return tokenizer, model, device


def parse_content(page_content):
    # page_content 문자열에서 "dataSet.question.raw.text:" 이후의 텍스트를 추출
    try:
        question_text = page_content.split(':')[2].strip()
    except IndexError:
        question_text = "질문 내용을 찾을 수 없습니다."
    return question_text

# 사용자 입력 및 키워드를 통한 벡터 생성 함수 정의
def create_vector(text, tokenizer, model, device,):
    input_length = len(tokenizer.tokenize(text))
    inputs = tokenizer(text, return_tensors='pt', truncation=True, max_length=input_length).to(device)
    outputs = model(**inputs)
    vector = outputs.last_hidden_state.mean(dim=1).detach().cpu().numpy()
    # 메모리 해제
    del inputs, outputs
    torch.cuda.empty_cache()
    gc.collect()
    
    return vector


# 질문에 대한 문서 검색 및 응답 생성
def make_D_I_template(question, tokenizer, model, device, index,  docs,keyword,card):
    # 입력 처리
    docs = docs
    query_vector = create_vector(question, tokenizer, model, device,)
    
    adict = dict()
    for i in range(len(keyword)):
        try:
            adict[keyword['직무'][i]].append(keyword['키워드'][i])
        except:
            adict[keyword['직무'][i]] = [keyword['키워드'][i]]
    keywords = adict[card]
    #print(keywords)
    D, I = list(),list()
    
    # 각 키워드와 사용자 질문을 결합하여 검색 벡터 생성
    for keyword in keywords:
        #print(keyword)
        # 키워드 벡터 생성
        keyword_vector = create_vector(keyword*150, tokenizer, model, device,)  # 사용자 질문 벡터 생성 방식과 동일하게 키워드 벡터 생성
        # 사용자 질문 벡터와 키워드 벡터를 결합 (예: 요소별 곱)
        combined_vector = (0.5* query_vector + 0.5 * keyword_vector) 
        # 결합된 벡터로 문서 검색
        D_small, I_small = index.search(combined_vector, k=2)  # k=1로 설정하여 가장 유사한 문서 하나만 검색
        D.append(D_small[-1])  # 각 키워드의 거리 정보 저장
        I.append(I_small[-1])  # 각 키워드의 인덱스 정보 저장
        #print(D,I)


            
    # 응답 생성
    template = f'''
    System:<start of turn>
    사용자의 정보와 말 그리고 키워드를 중점으로 문장에서 찾을 수 없는 꼬리질문을 만드시오.
    첫번째 문장은 사용자에 대한 정보입니다.
    차근차근 생각해서 말하세요.
    무리해서 말을 만들지 마세요.
    다음 규칙을 기반으로 꼬리 질문을 생성해주세요
    1) 해당 글에서 정답을 찾을 수 없어야합니다.
    2) 해당 정보를 기반으로 유저의 말에 대해 추가적인 질문을 만들어야합니다.
    3) 말투는 면접관의 말투를 합니다.
    4) 같은 말은 반복하지 않습니다.
    5) 가능하면 유저가 답변하기 어려운 질문을 생성해주세요
    6) 문맥상 제 , 저희, 본인 같이 1인칭 단어는 "당신" , "우리", "귀하" 로 2인칭 단어로서 바꿔 생성하세요.
    7) 문장이 반복한다 느끼면 바로 중단하세요.
    8) 답변 부탁 라는 말이 보이면 바로 중단하세요.
    <end of turn>
    ================================
    <start of turn>{question}<end of turn>
    ================================
    <start of turn>질문:

    <|eot_id|>
    '''
    #print('final', I)
    return D, I , template
from torch import cuda

import re

def remove_duplicate_sentences(text):
    # 문장 구분을 위해 공백을 기준으로 분할합니다.
    sentences = text.split()
    # 중복을 제거하기 위해 set을 사용하되, 순서를 유지하기 위해 OrderedDict를 사용합니다.
    unique_sentences = list(dict.fromkeys(sentences))
    # 중복이 제거된 문장들을 다시 연결합니다.
    return ' '.join(unique_sentences)

# 띄어쓰기를 정리하는 함수
def clean_spacing(text):
    # 연속된 공백을 하나의 공백으로 변환
    text = re.sub(r'\s+', ' ', text)
    # 문자열 앞뒤 공백 제거
    text = text.strip()
    return text

def search_and_respond(question, model_id, docs, D, I, template, max_gpus=7):
    prompt_template = PromptTemplate(template=template, input_variables=["inputs"])
    
    # 사용 가능한 GPU 수 확인
    num_devices = cuda.device_count()

    # 사용할 최대 GPU 수 설정
    num_gpus_to_use = min(num_devices, max_gpus)

    # 현재 사용할 GPU 인덱스를 저장하는 글로벌 변수
    global current_device_index
    current_device_index = (current_device_index + 1) % num_gpus_to_use

    # HuggingFacePipeline 인스턴스 생성 시 현재 디바이스 사용
    llm = HuggingFacePipeline.from_model_id(
        model_id,
        device=current_device_index,  # 순환적으로 디바이스 선택
        task="text-generation",
        model_kwargs={"max_length": len(question) + 300, 'do_sample': True,
                      'early_stopping': True, 'num_beams': 2}
    )
    llm_chain = LLMChain(prompt=prompt_template, llm=llm)

    remember_memory = []
    trial = 1
    for idx,mdx in I:
        if (trial+1) %2 == 0:
            trial += 1    
            continue
        #print((idx+mdx)//2)
        #if idx >= 6700:
            #continue
        doc = docs[int(0.4*idx+0.6*mdx)]
        content = parse_content(doc.page_content)  # page_content에서 실제 질문을 추출하는 함수
        response = llm_chain.run(question=doc).split('<|eot_id|>')
        #print(f'\n\n 참조한 질문 : {content[:150]}')
        #print(f"Response to doc {int(0.4*idx+0.6*mdx)}: {response[1]} \n\n")
        #print(response)
        #print(clean_spacing(response[1]))
        text = clean_spacing(response[1].split('답변')[0])
        remember_memory.append(remove_duplicate_sentences(text))
        # 각 반복 후 메모리 해제
        del response
        torch.cuda.empty_cache()
        gc.collect()
        
        trial += 1    
    return remember_memory

# 글로벌 변수 초기화
current_device_index = -1

# 메인 함수
def main(question,card:str='ARD'):
    model_path = "/home/ubuntu/dohyeon/saved_model"
    model_id = "Ino9/Llama-3-Open-Ko-8B-Instruct-preview_interview_140000"
    tokenizer, model, device = initialize_model(model_path)
    index = faiss.read_index("/home/ubuntu/dohyeon/db_index.faiss")
    doc_vectors = np.load("/home/ubuntu/dohyeon/db_doc_vectors.npy")
    loader = CSVLoader(file_path="/home/ubuntu/dohyeon/useing_db2.csv")
    docs = loader.load()
    keyword = pd.read_csv('/home/ubuntu/dohyeon/dfkeyword.csv', encoding='utf-8')
    D, I, template = make_D_I_template(question, tokenizer, model, device, index,  docs, keyword , card)
    
    result = search_and_respond(question, model_id, docs,D, I,template)
    return result
# 실행 예시
if __name__ == "__main__":
    question = sys.argv[1]
    card = question.split()[0]
    result = main(question,card)
    
    print(result[0].split("\n")[0])