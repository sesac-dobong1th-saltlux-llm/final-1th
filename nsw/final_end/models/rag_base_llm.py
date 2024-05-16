import warnings
import logging
import gc
import torch
import numpy as np
import faiss
from transformers import AutoTokenizer, AutoModel
from tqdm.auto import tqdm
from langchain_community.document_loaders.csv_loader import CSVLoader
from langchain.llms import HuggingFacePipeline
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
import sys

# 경고와 로깅 설정
# 특정 라이브러리 경고 무시
warnings.filterwarnings("ignore", category=FutureWarning, module="huggingface_hub")
warnings.filterwarnings("ignore", category=UserWarning, module="transformers")
logging.basicConfig(level=logging.ERROR)

import torch
from transformers import AutoTokenizer, AutoModel

def initialize_model(model_path, gpu_indices=[4, 5,6, 7]):
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


# 질문에 대한 문서 검색 및 응답 생성
def search_and_respond(question, model_id, tokenizer, model, device, index, doc_vectors, docs):
    # 입력 처리
    docs = docs
    input_length = len(tokenizer.tokenize(question))
    query_inputs = tokenizer(question, return_tensors='pt', truncation=True, max_length=input_length).to(device)
    query_outputs = model(**query_inputs)
    query_vector = query_outputs.last_hidden_state.mean(dim=1).detach().cpu().numpy()

    # 메모리 해제
    del query_inputs, query_outputs
    torch.cuda.empty_cache()
    gc.collect()

    # 문서 검색
    D, I = index.search(query_vector, k=3)
    for i, (dist, idx) in enumerate(zip(D[0], I[0])):
        print(f"Rank {i+1}: Index {idx}, Distance {dist}")


    # 응답 생성
    template = f'''
    System:<start of turn>
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
    <end of turn>
    ================================
    <start of turn>{question}<end of turn>
    ================================
    <start of turn>질문:

    <|eot_id|>
    '''

    prompt_template = PromptTemplate(template=template, input_variables=["inputs"])
    llm = HuggingFacePipeline.from_model_id(model_id, device=7, task="text-generation",
                                            model_kwargs={"max_length": len(question) + 300, 'do_sample': True,
                                                          'early_stopping': True, 'num_beams': 2})
    llm_chain = LLMChain(prompt=prompt_template, llm=llm)
    print("요청한 질문:",question)
    print('================================================================================')
    
    remember_memory = []
    for idx in I[0]:
        if idx >= 6700:
            continue
        doc = docs[idx]
        content = parse_content(doc.page_content)  # page_content에서 실제 질문을 추출하는 함수
        print(f'참조한 질문 : {content[:150]}')
        response = llm_chain.run(question=doc).split('<|eot_id|>')
        print(f"Response to doc {idx}: {response[1]}")
        #print(response)
        remember_memory.append(response[1])
        # 각 반복 후 메모리 해제
        del response
        torch.cuda.empty_cache()
        gc.collect()
    return remember_memory
# 메인 함수
def main(question):
    model_path = "/home/ubuntu/dohyeon/saved_model"
    model_id = "Ino9/Llama-3-Open-Ko-8B-Instruct-preview_interview_140000"
    tokenizer, model, device = initialize_model(model_path)
    index = faiss.read_index("/home/ubuntu/dohyeon/db_index.faiss")
    doc_vectors = np.load("/home/ubuntu/dohyeon/db_doc_vectors.npy")
    loader = CSVLoader(file_path="/home/ubuntu/dohyeon/useing_db2.csv")
    docs = loader.load()

    result = search_and_respond(question, model_id, tokenizer, model, device, index, doc_vectors, docs)
    return result
# 실행 예시
if __name__ == "__main__":
    question = sys.argv[1]
    result = main(question)
    
    print(result)