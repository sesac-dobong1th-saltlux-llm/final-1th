import openai from "../config/open-ai.js"; // openai 설정 가져오기
// open ai 질문 생성
export async function processIntroduction(introduction) {
  const prompt_content = `
        You're a hiring manager looking for a new Back-end engineer to join your team. Based on the following cover letter, generate 7 interview questions and tips for each question. Please provide your response in JSON format with the following schema:
        {
            "questions": [
                {"question_text": "...", "question_tip": "..."},
                {"question_text": "...", "question_tip": "..."},
            ]
        }

        Instructions:
        - Format: Json
        - Level of Difficulty: Advanced
        - Number of Questions: 6
        - Target Audience:ica Applnt
        - Objective of Questions: To assess the applicant's qualifications and suitability for the role
        - Note: The 'tip' should guide the applicant on how best to answer the question.
        - Language Used: Korean

        Resume Information:
        - cover letter category: Project
        - cover letter: ${introduction}

        Please respond in Korean.
    `;
  const messages = [
    {
      role: "system",
      content: "You are a helpful interview question generator.",
    },
    { role: "user", content: prompt_content },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      temperature: 0.5,
    });

    console.log("AI Response:", response.choices[0].message);
    const content = response.choices[0].message.content;

    // JSON 부분만 추출
    const jsonPart = content.split("```json")[1].split("```")[0].trim();
    const data = JSON.parse(jsonPart); // JSON 파싱

    return data;
  } catch (error) {
    console.error("OpenAI API error:", error);
  }
}
// 중간 저장용도 지금은 세션이지만 TODO sql에 넣기
export function storeResultsSomehow(req, results) {
  // 결과를 세션에 저장
  req.session.results = results;
}

export async function summaryIntroduction(introduction) {
  const prompt_content =
    `다음문장 ${introduction}의 내용을 20글자 이하로 요약해서줘`;
  const messages = [
    { role: "system", content: "당신은 문장을 20글자 이하로 요약해 줍니다" },
    { role: "user", content: prompt_content },
  ];
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      temperature: 0.5,
    });

    
    const content = response.choices[0].message.content;
    console.log("요약 Response:", content);
    return content;
  } catch (error) {
    console.error("OpenAI API error:", error);
  }
}
