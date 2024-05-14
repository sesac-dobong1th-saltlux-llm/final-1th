import pygame
import speech_recognition as sr
from gtts import gTTS
import time
import os

# pygame mixer 초기화
pygame.mixer.init()

def speak(text):
    tts = gTTS(text=text, lang='ko')
    filename = 'C:/Users/inho0/Downloads/inno/voice.mp3'
    tts.save(filename)

    pygame.mixer.music.load(filename)
    pygame.mixer.music.play()

    while pygame.mixer.music.get_busy():
        pygame.time.Clock().tick(10)

    pygame.mixer.music.stop()
    pygame.mixer.music.unload()

    try:
        os.remove(filename)
    except PermissionError:
        print("PermissionError: Waiting to delete file...")
        time.sleep(1)

def get_audio(timeout_seconds=5, phrase_limit=90):
    r = sr.Recognizer()
    with sr.Microphone() as source:
        print("듣고 있습니다. 말씀해주세요.")
        try:
            audio = r.listen(source, timeout=timeout_seconds, phrase_time_limit=phrase_limit)
        except sr.WaitTimeoutError:
            print("시간 초과: 음성 입력이 감지되지 않았습니다.")
            return ""

        said = ''
        try:
            said = r.recognize_google(audio, language='ko-KR')
            print("지원자의 답변: ", said)
        except sr.UnknownValueError:
            print("인식할 수 없는 음성입니다.")
        except sr.RequestError:
            print("서비스 요청에 실패했습니다; 구글 API에 연결할 수 없습니다.")
        except Exception as e:
            print("Exception: " + str(e))
    return said

if os.path.isfile('C:/Users/inho0/Downloads/inno/memo.txt'):
    os.remove('C:/Users/inho0/Downloads/inno/memo.txt')

speak('안녕하세요. 2초 후에 답변을 시작해주세요. 종료할거면 "마치겠습니다"라고 말씀해주세요.')

first_run = True
while True:
    if first_run:
        text = get_audio(5, 90)
        first_run = False
    else:
        speak('더 하실 말씀 있으신가요?')
        text = get_audio(5, 90)
    
    if not text and not first_run:
        break  # 응답이 없으면 반복을 종료합니다.
    
    with open('C:/Users/inho0/Downloads/inno/memo.txt', 'a', encoding='utf-8') as f:
        f.write(str(text) + "\n")

    # '마치겠습니다'라고 말하면 프로그램을 종료합니다.
    if '마치겠습니다' in text:
        break

    time.sleep(0.1)
