

const OpenAI = require('openai-api');
const path = require('path');
const express = require("express");

require("dotenv").config();

const app = express();
app.use(express.json());
app.set("port", process.env.PORT || 3000);

// const configuration = new Configuration({
//   apiKey: process.env.OPENAI_API_KEY,
// });
const openai = new OpenAI(process.env.OPENAI_API_KEY);

app.get('/', (req, res) => {
    // res.send('Hello, Express');
    res.sendFile(path.join(__dirname, '/index.html'));
  });

app.post("/generate_questions", async (req, res) => {
  const {
    type,
    job_position,
    introduction_article,
    personal_statement,
    project_title,
    project_description,
  } = req.body;

  if (!type || !job_position) {
    return res.status(400).json({ error: "Required fields are missing." });
  }

  if (job_position.length > 100) {
    return res.status(400).json({ error: "직무란은 100자를 초과할 수 없습니다." });
  }

  let prompt_content = "";
  let messages = [];

  if (type === "personal_statement_form") {
    if (!introduction_article || !personal_statement) {
      return res.status(400).json({ error: "Additional information for personal statement is required." });
    }
    if (introduction_article.length > 300) {
      return res.status(400).json({ error: "자기소개서 항목란은 300자를 초과할 수 없습니다." });
    }
    if (personal_statement.length > 2000) {
      return res.status(400).json({ error: "자기소개서 내용란은 2000자를 초과할 수 없습니다." });
    }

    prompt_content = `You're a hiring manager looking for a new ${job_position} to join your team. Based on the following cover letter, generate 7 interview questions and tips for each question. Please provide your response in JSON format with the following schema:
    {
      "questions": [
        {"question": "...", "tip": "..."},
        {"question": "...", "tip": "..."},
        ...
      ]
    }
    Instructions:
    - Format: Json
    - Level of Difficulty: Advanced
    - Number of Questions: 7
    - Target Audience: Applicant
    - Objective of Questions: To assess the applicant's qualifications and suitability for the role
    - Note: The 'tip' should guide the applicant on how best to answer the question.
    - Language Used: Korean
    Resume Information:
    - cover letter category: ${introduction_article}
    - cover letter: ${personal_statement}
    Please respond in Korean.`;

    messages = [
      {"role": "system", "content": "You are a helpful interview question generator."},
      {"role": "user", "content": prompt_content}
    ];

  } else if (type === "project") {
    if (!project_title || !project_description) {
      return res.status(400).json({ error: "Project title and description are required." });
    }
    if (project_title.length > 300) {
      return res.status(400).json({ error: "프로젝트 제목란은 300자를 초과할 수 없습니다." });
    }
    if (project_description.length > 2000) {
      return res.status(400).json({ error: "프로젝트 설명란은 2000자를 초과할 수 없습니다." });
    }

    prompt_content = `You're a hiring manager looking for a new ${job_position} to join your team. Based on the cover letter about this project, generate 7 interview questions and tips for each question. Please provide your response in JSON format with the following schema:
    {
      "questions": [
        {"question": "...", "tip": "..."},
        {"question": "...", "tip": "..."},
        ...
      ]
    }
    Instructions:
    - Format: Json
    - Level of Difficulty: Advanced
    - Number of Questions: 7
    - Target Audience: Applicant
    - Objective of Questions: To assess the applicant's qualifications and suitability for the role
    - Note: The 'tip' should guide the applicant on how best to answer the question.
    - Language Used: Korean
    Project Information:
    - Project Title: ${project_title}
    - Project Description: ${project_description}
    Please respond in Korean.`;

    messages = [
      {"role": "system", "content": "You are a helpful interview question generator."},
      {"role": "user", "content": prompt_content}
    ];
  } else {
    return res.status(400).json({ error: "Invalid type selected." });
  }

  try {
    const response = await openai.createCompletion({
      model: "gpt-3.5-turbo",
      messages: messages,
      temperature: 0.5,
      max_tokens: 1000
    });
    content=res.json({ questions: response.data.choices[0].text });
    console.log(content)
    print(content)
  } catch (error) {
    console.error("Error with OpenAI service:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(app.get("port"), () => {
  console.log(`${app.get("port")}번 포트에서 서버가 실행 중입니다.`);
});
