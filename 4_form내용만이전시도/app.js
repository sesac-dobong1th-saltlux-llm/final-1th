import express from 'express';
import bodyParser from 'body-parser';
import path, { resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import openai from './config/open-ai.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/submit-form', async (req, res) => {
    const { job_position, type_selected, textarea } = req.body;

    const prompt_content = `
        You're a hiring manager looking for a new ${job_position} to join your team. Based on the following cover letter, generate 7 interview questions and tips for each question. Please provide your response in JSON format with the following schema:
        {
            "questions": [
                {"question": "...", "tip": "..."},
                {"question": "...", "tip": "..."}
            ]
        }

        Instructions:
        - Format: Json
        - Level of Difficulty: Advanced
        - Number of Questions: 7
        - Target Audience:ica Applnt
        - Objective of Questions: To assess the applicant's qualifications and suitability for the role
        - Note: The 'tip' should guide the applicant on how best to answer the question.
        - Language Used: Korean

        Resume Information:
        - cover letter category: ${type_selected === 'personal_statement_form' ? 'Personal Statement' : 'Project'}
        - cover letter: ${textarea}

        Please respond in Korean.
    `;

    const messages = [
        {"role": "system", "content": "You are a helpful interview question generator."},
        {"role": "user", "content": prompt_content}
    ];

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: messages,
            temperature: 0.5
        });
        //console.log(response)
        console.log('AI Response:', response.choices[0].message);
        //const aiResponse = response.choices[0].message.content;
        //console.log('test: ', aiResponse); <= 요렇게하면 string으로 인식해서 처음으로 복귀
        // '''json이 겨있어서 세상 에러났던거 짤라내기
        
        const content = response.choices[0].message.content;

        // JSON 부분만 추출
        const jsonPart = content.split('```json')[1].split('```')[0].trim();
        const data = JSON.parse(jsonPart); // JSON 파싱

        res.json({
            job_position,
            type_selected,
            textarea,
            ai_response:data
        });
    } catch (error) {
        console.error("OpenAI API error:", error);
        res.status(500).json({ error: "Server error occurred while fetching AI response." });
    }
});

app.post('/submit-answer', async (req, res) => {
    const { question, answer } = req.body;

    // 질문과 답변을 바탕으로 추가 질문과 팁을 생성하는 프롬프트 구성
    const prompt_content = `
    Question: ${question}
    Answer: ${answer}
    Please provide additional questions and tips based on

        Instructions:
        - Format: Json
        - Level of Difficulty: Advanced
        - Number of Questions: 5
        - Target Audience:ica Applnt
        - Objective of Questions: To assess the applicant's qualifications and suitability for the role
        - Note: The 'tip' should guide the applicant on how best to answer the question.
        - Language Used: Korean
    `;

    // 메시지 객체 구성을 수정
    const messages = [
        {"role": "system", "content": "You are a helpful interview question generator that provides follow-up questions and tips based on the applicant's answer."},
        {"role": "user", "content": prompt_content}
    ];

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // 모델 선택
            messages: messages, // 수정된 메시지 객체 사용
            temperature: 0.5, // 온도 설정으로 창의성 조절
        });

        // 응답 파싱 및 JSON 포맷으로 클라이언트에 전송
        // 응답에서 추가 질문과 팁만 추출하기 위해 처리 로직 추가
        const content = response.choices[0].message.content;
        console.log(typeof content)
        console.log(content)
        
        const data = JSON.parse(content); // JSON 파싱

        res.json({ data });
    } catch (error) {
        console.error("Error processing answer:", error);
        res.status(500).json({ error: "Error processing answer" });
    }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
