import sys
import librosa
from pydub import AudioSegment
from transformers import pipeline
import torch

# 경로와 모델 설정
audio_path = sys.argv[1]  # 명령줄 인수에서 파일 경로를 받음
device = "cuda" if torch.cuda.is_available() else "cpu"

# Hugging Face의 transformer 모델을 이용한 음성 인식 파이프라인 설정
pipe = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-large",
    device=device
)

# 오디오 파일 로드 및 전처리
audio = AudioSegment.from_file(audio_path)
audio.export("temp.wav", format="wav")
waveform, _ = librosa.load("temp.wav", sr=16000)

# 음성 인식 결과 출력
result = pipe(waveform)
print(result['text'])
