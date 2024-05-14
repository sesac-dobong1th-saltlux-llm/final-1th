import torch
import torch.distributed as dist
import torch.nn.parallel
import torch.multiprocessing as mp
from torch.nn.parallel import DistributedDataParallel as DDP
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig, pipeline, TrainingArguments
from trl import SFTTrainer
from peft import LoraConfig, PeftModel
from datasets import Dataset, load_dataset
import pandas as pd
import os

def main():
    # Initialize process group
    if 'LOCAL_RANK' in os.environ:
        local_rank = int(os.environ['LOCAL_RANK'])
    else:
        local_rank = 0
    dist.init_process_group(backend='nccl', rank=local_rank)

    data = pd.read_csv('/home/ubuntu/inno/check.csv')
    train_dataset = Dataset.from_pandas(data)

    BASE_MODEL = "beomi/Llama-3-Open-Ko-8B-Instruct-preview"

    # LoRA and Bits & Bytes configuration
    lora_config = LoraConfig(
        r=8,
        target_modules=["q_proj", "o_proj", "k_proj", "v_proj", "gate_proj", "up_proj", "down_proj"],
        task_type="CAUSAL_LM",
    )

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16
    )

    model = AutoModelForCausalLM.from_pretrained(BASE_MODEL, device_map={"": local_rank}, quantization_config=bnb_config)
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, add_special_tokens=True)
    tokenizer.padding_side = 'right'


    def generate_prompt(example):
        prompt_list = []
        # Adding specific instructions to guide the model in generating complex questions
        instruction_text = (
            "차근차근 생각해서 말하세요.\n"
            "가능하면 유저가 답변하기 어려운 질문을 생성해주세요.\n"
            "당신의 질문이 사용자가 넣은 정보로 답변 할 수 없어야만 합니다.\n"
            "당신은 면접관입니다.\n"
            "면접자의 답변을 기반으로 질문을 생성해주세요.\n" 
            "면접 질문을 통하여 면접자가 직무에 대한 이해가 높은지, 스트레스를 잘 관리하는지, 오래다닐 사람인지, 팀에 융합이 잘 되는 사람인지, 협력으로 성과를 내는 사람인지 판단할 수 있어야 합니다.\n"
            "당신은 USER의 내용을 기반으로 USER의 전문적인 지식에 대해 물어봐야합니다.\n"
            "첫번째 문장은 사용자에 대한 정보입니다.\n"
            "다음 규칙을 기반으로 꼬리 질문을 생성해주세요:\n"
            "1) 해당 글에서 정답을 찾을 수 없어야 합니다.\n"
            "2) 해당 정보를 기반으로 유저의 말에 대해 추가적인 질문을 만들어야 합니다.\n"
            "3) 말투는 면접관의 말투를 합니다.\n"
            "4) 같은 말은 반복하지 않습니다.\n"
            "5) 가능하면 유저가 답변하기 어려운 질문을 생성해주세요.\n"
            "6) 문맥상 제, 저희 같이 1인칭 단어는 '당신', '우리'로 2인칭 단어로서 바꿔 생성하세요.\n"
            "면접자에게 물어볼 수 있는 질문을 생성하세요."
        )
        for i in range(len(example['Summary text'])):
            messages = [
                {"role": "user",
                "content": "{}\n\n{}".format(instruction_text, example['Summary text'][i])},
                {"role": "assistant",
                "content": "{}".format(example['Question'][i])}
            ]
            # Apply chat template to the generated messages
            chat_message = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False) + "<|eot_id|>"
            prompt_list.append(chat_message)
        return prompt_list


    # SFTTrainer를 사용하여 모델 학습을 수행합니다.
    trainer = SFTTrainer(
        model=model,  # 학습에 사용할 모델 객체
        train_dataset=train_dataset,  # 모델 학습에 사용할 학습 데이터셋
        max_seq_length=1024,  # 입력 시퀀스의 최대 길이
        args=TrainingArguments(
            output_dir="/home/ubuntu/inno/save/outputs",  # 학습 결과를 저장할 디렉토리
            max_steps=3000,  # 최대 학습 단계 수
            per_device_train_batch_size=2,  # 각 GPU/CPU 장치당 학습 배치 크기
            gradient_accumulation_steps=4,  # 배치 누적을 통한 경사도 업데이트
            optim="paged_adamw_8bit",  # Paged AdamW 최적화기 사용
            warmup_steps=0.03,  # 초기 학습률 증가 단계
            learning_rate=2e-4,  # 학습률
            fp16=True,  # 16비트 부동 소수점 연산 사용
            logging_steps=100,  # 로깅 간격
            push_to_hub=True,  # Hugging Face Hub에 업로드
            report_to='wandb',  # Weights & Biases에 학습 진행 상황 보고
            save_total_limit=1,  # Limit the total number of saved models
            save_steps=10,  # Save checkpoint every 10 steps
        ),
        peft_config=lora_config,  # LoRA PEFT 구성
        formatting_func=generate_prompt,  # 입력 데이터 형식 변환 함수
    )
    trainer.train()

    ADAPTER_MODEL = "lora_adapter"
    trainer.model.save_pretrained(ADAPTER_MODEL)

    model = AutoModelForCausalLM.from_pretrained(BASE_MODEL, device_map='auto', torch_dtype=torch.float16)
    model = PeftModel.from_pretrained(model, ADAPTER_MODEL, device_map='auto', torch_dtype=torch.float16)

    model = model.merge_and_unload()
    model.save_pretrained('/home/ubuntu/inno/save/model/Llama-3-ko')

if __name__ == "__main__":
    main()