import torch
from pydub import AudioSegment
import librosa
from transformers import pipeline

device = "cuda" if torch.cuda.is_available() else "cpu"

pipe = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-large",
    device=device
)

audio_path = input("오디오 파일 경로를 입력해주세요: ")
audio = AudioSegment.from_file(audio_path)
audio.export("temp.wav", format="wav")
waveform, _ = librosa.load("temp.wav", sr=16000)
result = pipe(waveform)
print(result['text'])
