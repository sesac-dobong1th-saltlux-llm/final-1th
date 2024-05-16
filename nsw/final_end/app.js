import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import session from "express-session";
import mysql from "mysql2";
import dbconfig from "./config/dbconfig.json" assert { type: "json" };


// 보이스 모음
import {SpeechClient } from "@google-cloud/speech";
const upload = multer({ dest: 'uploads/' }); // 파일 저장 위치 설정
import multer from 'multer';
const speechClient = new SpeechClient();
import { spawn } from 'child_process';
import fs from 'fs';

// 라우트 모음
import dbRouter from "./routes/dbconn.js";
import question from "./routes/question.js"
import dashbord from "./routes/dashbord.js"

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const pool = mysql.createPool({
  connectionLimit: 100,
  host: dbconfig.host,
  user: dbconfig.user,
  password: dbconfig.password,
  database: dbconfig.database,
  waitForConnections: true,
  queueLimit:10,
  debug: false,
});

// 프로미스 기반 메소드를 사용할 수 있는 프로미스 풀 생성
const promisePool = pool.promise();

// bodyParser는 JSON 데이터를 처리하기 위해 사용됩니다.
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// views 폴더 설정을 통해 정적 파일을 자동으로 제공
app.use(express.static(path.join(__dirname, "views")));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// 세션정의
app.use(
  session({
    secret: "secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 3_600_000 }, //1시간
  })
);


// 라우터를 경로에 연결
app.use(dbRouter)
app.use(question)
app.use(dashbord)


/////////////////////    경로처리 시작           ////////////////////

app.get('/',(req, res)=>{
  res.sendFile(path.join(__dirname, "views/index.html"));
})

// /choice 경로에 대한 get 요청
app.get("/choice", (req, res) => {
    res.sendFile(path.join(__dirname, "views/choice.html"));
});

// /one_magnetic 경로에 대한 get 요청을 처리
app.get("/one_magnetic", checkSession, (req, res) => {
  res.render('one_magnetic', { userId: req.session.user.id });
    // res.sendFile(path.join(__dirname, "views/one_magnetic.html"));
  });
  

//one_magnetic 경로의 Express용도
app.post("/submit_choices", checkSession, (req, res) => {
  const userChoices = req.body; // 사용자의 선택 받기
  
  userChoices.card  = userChoices.card.match(/[A-Za-z]+/)[0];
  userChoices.interviewType = userChoices.interviewType.slice(0, 2);
   // 세션에 사용자 선택 저장
   req.session.userChoices = userChoices;
   console.log('세션에 저장된 선택:', req.session.userChoices);
   

  res.sendFile(path.join(__dirname, "views/one_magnetic.html"));
});


// /tail_questions 대한 get 요청을 처리
app.get("/tail_questions",  (req, res) => {
  res.sendFile(path.join(__dirname, "views/tail_questions.html"));
});
// - 질문 생성 로직은 routes/question.js에 구현

// 이메일 인증
app.get("/find_password",  (req, res) => {
  res.sendFile(path.join(__dirname, "views/password/find_password.html"));
});

// 이메일 인증페이지
app.get("/clarify_pass", (req, res)=>{
  res.sendFile(path.join(__dirname, "views/password/clarify_pass.html"));
})

// 질문 선택 (기존 tail_questions 페이지)
app.get('/user/:userId/:chatId',checkSession,checkUserId,(req,res)=>{
  const userId = req.params.userId;
  const chatId = req.params.chatId;
  res.sendFile(path.join(__dirname, "views/make_questions.html"));
})
app.post('/user/:userId/:chatId',checkSession,checkUserId,(req,res)=>{
  const userId = req.params.userId;
  const chatId = req.params.chatId;
  res.sendFile(path.join(__dirname, "views/make_questions.html"));
})


// 꼬리질문 (뤼튼 처럼 만들기 도전)
app.get('/user/tail_chat/:userId/:chatId',checkSession,checkUserId,(req,res)=>{
  res.sendFile(path.join(__dirname,"views/tail_questions.html"))
})

// 보이스
app.get("/voice",(req,res)=>{
  res.sendFile(path.join(__dirname, "views/voice.html"));
})

// 대시보드
app.get("/dashBord1",(req,res)=>{
  res.sendFile(path.join(__dirname, "views/dashBord1.html"));
})

app.get('/get-user-info', (req, res) => {
  // 세션 또는 데이터베이스에서 사용자 이름을 가져온다고 가정
  const userName = req.session.user.name; // 세션에서 사용자 이름 가져오기
  res.json({ userName: userName });
});


// app.post('/audio', upload.single('audio'), (req, res) => {
//   const filePath = req.file.path; // multer를 통해 저장된 파일 경로

//   // Python 스크립트 실행
//   const pythonProcess = spawn('/opt/conda/bin/python', ['/home/ubuntu/14_고도화/models/3.py', filePath]);

//   let resultData = '';
//   pythonProcess.stdout.on('data', (data) => {
//       resultData += data.toString();
//   });

//   pythonProcess.stderr.on('data', (data) => {
//       console.error(`stderr: ${data}`);
//   });

//   pythonProcess.on('close', (code) => {
//       if (code !== 0) {
//           res.status(500).json({ error: "Python script execution error" });
//       } else {
//           res.json({ status: 'success', result: resultData.trim() });
//       }

//       // 처리 후 파일 삭제
//       fs.unlink(filePath, (err) => {
//           if (err) console.error("Failed to delete audio file:", err);
//       });
//   });
// });

app.post('/audio', upload.single('audio'), (req, res) => {
  const filePath = req.file.path; // multer를 통해 저장된 파일 경로
  const pythonProcess = spawn('/opt/conda/bin/python', ['models/audio_test.py', filePath]);

  let resultData = '';
  pythonProcess.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
      resultData += data.toString(); // 데이터를 문자열로 취합
  });

  pythonProcess.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
  });

  pythonProcess.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      fs.unlink(filePath, (err) => { // 파일 처리 후 삭제
          if (err) throw err;
          console.log('Temporarily saved file has been deleted');
      });
      res.send(resultData); // 음성 인식 결과를 클라이언트에 전송
  });
});



/////////////////////    경로처리 끝           ////////////////////

app.post("/logout", (req, res) => {
    // 세션 파괴
    req.session.destroy((err) => {
      if (err) {
        // 세션 파괴 중 에러 발생 시 500 상태 코드로 응답
        console.error("로그아웃 중 에러 발생:", err);
        return res.status(500).send({ message: "로그아웃 실패, 서버 에러." });
      }
  
      // 세션 파괴 후 클라이언트에 JavaScript를 전송하여 로그인 페이지로 리다이렉트
      res.send(`
              <script>
                  alert("로그아웃 되었습니다.");
                  window.location.href = "/";
              </script>
          `);
    });
  });


  
/**   세션 없을시 로그인페이지로 돌림 */
function checkSession(req, res, next) {
    if (!req.session.user || !req.session.user.id) {
      // 클라이언트에 JavaScript를 전송하여 alert를 보여주고 로그인 페이지로 리다이렉트
      res.send(`
              <script>
                  alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
                  window.location.href = "/";
              </script>
          `);
    } else {
      next();
    }
  }

  function checkUserId(req, res, next) {
    const userId = req.params.userId;  // URL에서 사용자 ID를 추출
    if (req.session && req.session.user && req.session.user.id === userId) {
      next();  // 사용자 ID가 일치하면 다음 미들웨어로 진행
    } else {
      // 클라이언트 측에 스크립트를 전달하여 alert 띄우기 및 이전 페이지로 이동
      res.send(`
        <script>
          alert('잘못된 접근입니다.');
          history.go(-1);
        </script>
      `);
    }
  }
  

  //health
  app.get('/health',(req,res)=>{
    res.status(200).send("헬스체크 떳냐? 히히 ")
  })

const port = process.env.PORT || 80;
app.listen(port, () => console.log(`서버가 ${port}번 포트에서 실행 중입니다.`));