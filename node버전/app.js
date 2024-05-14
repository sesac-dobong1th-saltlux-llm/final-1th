const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const winston = require('winston');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 로깅 설정
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ],
});

// 요청 제한 설정
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 1, // 각 IP로부터 1분당 최대 요청 수
  message: { error: "Too many requests, please try again later." }
});
app.use('/generate_questions', limiter);

// 라우트 설정
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html'); // HTML 파일 경로 지정 필요
});

app.post('/generate_questions', async (req, res) => {
  const { type, job_position, introduction_article, personal_statement } = req.body;

  // 입력 검증
  if (!job_position || job_position.length === 0 || job_position.length > 100) {
    return res.status(400).json({ error: "직무란은 100자를 초과할 수 없습니다." });
  }

  try {
    const response = await axios.post('https://api.openai.com/v1/engines/text-davinci-003/completions', {
      prompt: "some-prompt-here",
      max_tokens: 100
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    res.json({ questions: response.data.choices[0].text });
  } catch (error) {
    logger.error('API request failed', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
