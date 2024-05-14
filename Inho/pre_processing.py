import pandas as pd
import ast

def create_text_column(df):
    """
    주어진 DataFrame에 새로운 'text' 열을 자동으로 추가하는 함수입니다.

    Parameters:
    df (pandas.DataFrame): 입력 DataFrame

    Returns:
    pandas.DataFrame: 'text' 열이 추가된 DataFrame
    """
    # 필요한 열 선택
    selected_cols = ['dataSet.info.occupation', 'dataSet.info.experience', 'case', 'dataSet.question.raw.text', 'dataSet.answer.raw.text', 'dataSet.answer.summary.text']
    selected_df = df[selected_cols].copy()

    # 열 이름 변경
    col_rename = {
        "dataSet.info.experience": "Work Experience", 
        'dataSet.info.occupation': 'Job', 
        'case': 'Interview Type', 
        "dataSet.question.raw.text": "Question", 
        "dataSet.answer.raw.text": "Answer", 
        'dataSet.answer.summary.text':'Summary Answer'
    }
    selected_df.rename(columns=col_rename, inplace=True)

    # Interview Type 값 변환
    interview_type_map = {
        'job': '직무면접',
        'personality': '인성면접'
    }
    selected_df['Interview Type'] = selected_df['Interview Type'].map(interview_type_map)

    # Work Experience 값에 따른 한국어 번역
    selected_df['Work Experience'] = selected_df['Work Experience'].apply(
        lambda x: '신입' if x == 'NEW' else '경력직' if x == 'EXPERIENCED' else '알 수 없음'
    )

    # text 열 생성
    selected_df['Summary text'] = selected_df['Job'] + ' 직무의 ' + selected_df['Interview Type'] + '에 참가하게 된 ' + selected_df['Work Experience'] + ' 지원자입니다. ' + selected_df['Summary Answer']
    selected_df['text'] = selected_df['Job'] + ' 직무의 ' + selected_df['Interview Type'] + '에 참가하게 된 ' + selected_df['Work Experience'] + ' 지원자입니다. ' + selected_df['Answer']

    # 행 순서 랜덤화 및 인덱스 초기화
    selected_df = selected_df.sample(frac=1).reset_index(drop=True)

    return selected_df
