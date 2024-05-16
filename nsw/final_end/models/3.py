import pygame
import speech_recognition as sr
from gtts import gTTS
import os
import time

# 승우 추가 잘모르지만 실제오디오를 잡아 에러가 남으로 dummy 드라이버로 마이크를 못잡는 문제를 회피할수있다해서 추가 05_11
os.environ['SDL_AUDIODRIVER'] = 'dummy'
# pygame mixer 초기화
pygame.mixer.init()

def speak(text):
    tts = gTTS(text=text, lang='ko')
    filename = '/home/ubuntu/14_고도화/backvoice/voice.mp3'
    tts.save(filename)
    pygame.mixer.music.load(filename)
    pygame.mixer.music.play()

    # 재생이 끝날 때까지 대기
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
            said = r.recognize_google(audio, language='ko-KR')
            print("지원자의 답변: ", said)
            return said
        except sr.WaitTimeoutError:
            print("시간 초과: 음성 입력이 감지되지 않았습니다.")
            return ""
        except (sr.UnknownValueError, sr.RequestError) as e:
            print("오류가 발생했습니다:", str(e))
            return ""
        except Exception as e:
            print("처리되지 않은 예외:", str(e))
            return ""

if os.path.isfile('/home/ubuntu/14_고도화/backvoice/memo.txt'):
    os.remove('/home/ubuntu/14_고도화/backvoice/memo.txt')

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

    with open('/home/ubuntu/14_고도화/backvoice/memo.txt', 'a', encoding='utf-8') as f:
        f.write(str(text) + "\n")

    if '마치겠습니다' in text:
        break

    time.sleep(0.1)
