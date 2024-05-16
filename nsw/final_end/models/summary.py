import pandas as pd
import re
from transformers import PreTrainedTokenizerFast, BartForConditionalGeneration, AutoConfig,BartConfig
import sys
import warnings
import json

warnings.filterwarnings("ignore")
config = BartConfig.from_pretrained("EbanLee/kobart-summary-v3", label2id={}, id2label={}, num_labels=0)
tokenizer = PreTrainedTokenizerFast.from_pretrained("EbanLee/kobart-summary-v3")
model = BartForConditionalGeneration.from_pretrained("EbanLee/kobart-summary-v3", config=config)

def generate_summary(job, interview_type, work_experience, text):
    try:
        inputs = tokenizer(text, return_tensors="pt", padding="max_length", truncation=True, max_length=500)
        summary_text_ids = model.generate(
            input_ids=inputs['input_ids'],
            attention_mask=inputs['attention_mask'],
            bos_token_id=model.config.bos_token_id,
            eos_token_id=model.config.eos_token_id,
            length_penalty=1.0,
            max_length=500,
            min_length=0,
            num_beams=4,
            repetition_penalty=1.5,
            no_repeat_ngram_size=15
        )
        summary = tokenizer.decode(summary_text_ids[0], skip_special_tokens=True)
        summary = summary.replace('\n', ' ').strip()
        summary = re.sub(r'\s{3,}.*', '', summary)
        summary = re.sub(r'\.+', '.', summary)
        full_text = f"{job} 직무의 {interview_type}면접에 참가하게 된 {work_experience}입니다. {summary}"
        
        
        
    except Exception as e:
        result = {'status': 'error', 'message': str(e)}

    print(full_text)
    

if __name__ == "__main__":
    job, interview_type, work_experience, text = sys.argv[1:5]
    generate_summary(job, interview_type, work_experience, text)
    