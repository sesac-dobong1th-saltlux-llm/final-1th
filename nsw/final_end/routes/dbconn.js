import mysql from "mysql2";
import express, { application } from "express";
import dbconfig from "../config/dbconfig.json" assert { type: "json" };
import sendEmail from "../services/mailTest.js";
import { spawn } from "child_process";

const router = express.Router();

const pool = mysql.createPool({
  connectionLimit: 100,
  host: dbconfig.host,
  user: dbconfig.user,
  password: dbconfig.password,
  database: dbconfig.database,
  debug: false,
});

/* 아이디 중복검사 */
router.post("/process/checkuid", (req, res) => {
  console.log("/process/checkuid 이벤트 체크");
  // 여기서 생성한 랜덤한 값과 이메일에 보낸값이 같고
  // 그러면 승인 이 떨어짐

  /*
        1. id 받아와서 select 검색
        2. 1이상 나오면 res로 fail전송
        3. 0이면 어서와
    */

  const { uid } = req.body;

  pool.getConnection((err, conn) => {
    if (err) {
      if (conn) conn.release();
      console.error("Mysql getConnection error: ", err);
      res
        .status(500)
        .send({ success: false, message: "Database connection failed" });
      return;
    }

    console.log("데이터베이스 연결됨");
    const sql = "SELECT COUNT(*) AS count FROM user WHERE user_login_id = ?";
    conn.query(sql, [uid], (err, results) => {
      conn.release();
      if (err) {
        console.error("SQL 실행 시 오류 발생: ", err);
        res.status(500).send({ success: false, message: "SQL Error" });
        return;
      }

      const count = results[0].count;
      if (count > 0) {
        console.log("중복 아이디 있음");
        res.send({ success: false, message: "이미 사용 중인 아이디입니다." });
      } else {
        console.log("사용 가능한 아이디");
        res.send({ success: true, message: "사용 가능한 아이디입니다." });
      }
    });
  });
});

/* 이메일 검사 시작 - 회원가입, 비밀번호 인증 */
// 이메일 중복 검사 함수
function checkDuplicateEmail(email) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, conn) => {
      if (err) {
        if (conn) conn.release();
        console.error("Mysql getConnection error: ", err);
        reject(new Error("Database connection failed"));
        return;
      }

      console.log("데이터베이스 연결됨");
      const sql = "SELECT COUNT(*) AS count FROM user WHERE user_email = ?";
      conn.query(sql, [email], (err, results) => {
        conn.release();
        if (err) {
          console.error("SQL 실행 시 오류 발생: ", err);
          reject(new Error("SQL Error"));
          return;
        }

        const count = results[0].count;
        resolve(count > 0);
      });
    });
  });
}

// 회원가입 메일발송
router.post("/process/approve", async (req, res) => {
  console.log("/process/approve 이벤트 체크");

  const { email } = req.body; // 이메일 주소 받아오기

  try {
    const isDuplicate = await checkDuplicateEmail(email);
    if (isDuplicate) {
      console.log("중복 이메일 있음");
      res.send({ success: false, message: "이미 사용 중인 이메일 입니다." });
      return;
    }

    // 중복 이메일이 없을 경우, 이메일 전송 로직 처리
    const verificationCode = Math.floor(1000 + Math.random() * 9000);
    await sendEmail({
      to: email,
      subject: "이메일 인증 코드",
      text: `인증 코드: ${verificationCode}`,
    });

    res.send({
      success: true,
      message: "인증 코드가 발송되었습니다.",
      verificationCode: verificationCode,
    });

  } catch (error) {
    console.error("에러 발생: ", error.message);
    res.status(500).send({ success: false, message: error.message });
  }
});

// 비밀번호 이메일 인증 전송
let test_save_mail = 0
let test_save_user = ''
router.post('/process/find_password', async (req, res) => {
  const email = req.body.email;

  try {
    const exists = await checkDuplicateEmail(email);
    if (!exists) {
      res.json({ success: false, message: "등록되지 않은 이메일입니다." });
    } else {
      // 이메일이 존재할 경우 랜덤 코드 생성 및 이메일 전송
      try {

        // 중복 이메일이 없을 경우, 이메일 전송 로직 처리
        const verificationCode = Math.floor(1000 + Math.random() * 9000);
        test_save_mail = verificationCode
        await sendEmail({
          to: email,
          subject: "이메일 인증 코드",
          text: `인증 코드: ${test_save_mail}`,
        });

        res.send({
          success: true,
          message: "인증 코드가 발송되었습니다.",
          verificationCode: test_save_mail,
        });

      } catch (error) {
        console.error("에러 발생: ", error.message);
        res.status(500).send({ success: false, message: error.message });
      }
    }
  } catch (error) {
    console.error("에러 발생: ", error);
    res.status(500).send({ success: false, message: "서버 오류가 발생했습니다." });
  }
});



router.post('/process/verify_code', async (req, res) => {
  const { code } = req.body; // 클라이언트로부터 받은 코드
  const expectedCode = String(test_save_mail); // 데이터베이스 또는 세션에서 예상 코드를 문자열로 변환

  console.log(expectedCode + " 왼쪽 메일 오른쪽 내가 입력 " + code);
  console.log("expectedCode type: " + typeof expectedCode);
  console.log("code type: " + typeof code);

  if (code === expectedCode) {
    res.send({ success: true, message: "인증 성공! 비밀번호를 변경해주세요." });
  } else {
    res.send({ success: false, message: "인증 코드가 틀렸습니다. 다시 시도해주세요." });
  }
});


/* 이메일 검사 끝 - 회원가입, 비밀번호 인증 */

/**  회원 추가 */
router.post("/process/adduser", (req, res) => {
  console.log("/process/adduser");
  const { uid, uname, uemail, upass } = req.body;

  pool.getConnection((err, conn) => {
    if (err) {
      if (conn) conn.release();

      console.log("Mysql getConnection error: " + err);
      return;
    }

    console.log("데이터베이스 연결 잘됨");
    const exec = conn.query(
      "insert into user (user_login_id, user_name, user_email, user_pass) values (?,?,?, SHA2(?,512) );",
      [uid, uname, uemail, upass],
      (err, result) => {
        conn.release();
        console.log("실행된 SQL: " + exec.sql);
        if (err) {
          console.log("SQL 실행 시 오류 발생.");
          console.dir(err);
          return;
        }

        if (result) {
          console.dir(result);
          console.log("Inserted 성공");
          res.send({
            success: true,
            message: "환영합니다 로그인 부탁드립니다!",
            redirectTo: "/",
          });
        } else {
          console.dir(result);
          console.log("Inserted 실패");
        }
      }
    );
  });
});

/* 로그인 */
router.post("/process/login", (req, res) => {
  const { uid, upass } = req.body;
  pool.getConnection((err, conn) => {
    if (err) {
      console.error("Mysql getConnection error: " + err);
      res.status(500).send({ success: false, message: "데이터베이스 연결 실패" });
      return;
    }
    conn.query("SELECT `user_login_id`, `user_name` FROM `user` WHERE `user_login_id` = ? AND `user_pass` = SHA2(?, 512)", [uid, upass], (err, rows) => {
      conn.release();
      if (err) {
        console.error('SQL 실행 시 오류 발생:', err);
        res.status(500).send({ success: false, message: "로그인 처리 중 오류 발생" });
        return;
      }
      if (rows.length > 0) {
        console.log('아이디 [%s], 이름 [%s]으로 로그인 성공', uid, rows[0].user_name);

        // 세션에 정보 저장
        req.session.user = { id: uid, name: rows[0].user_name, role: rows[0].role };

        res.send({
          success: true,
          message: "환영합니다, " + rows[0].user_name + "님!",
          redirectTo: "/choice"
        });
      } else {
        res.send({ success: false, message: "아이디 또는 비밀번호가 일치하지 않습니다." });
      }
    });
  });
});


/* 왼쪽 채팅방 리스트 */
router.get("/api/myChatList", (req, res) => {
  if (!req.session.user || !req.session.user.id) {
    res.status(401).send({ success: false, message: "로그인이 필요합니다." });
    return;
  }
  console.log('채팅리스트 이벤트 테스트')
  const userId = req.session.user.id;
  //console.log(userId)
  pool.getConnection((err, conn) => {
    if (err) {
      console.error("Mysql getConnection error: ", err);
      res.status(500).send({ success: false, message: "Database connection failed" });
      return;
    }

    const sql = "SELECT chat_summary, chat_created_at, chat_id, user_login_id FROM chat WHERE user_login_id = ? ORDER BY chat_created_at DESC";
    conn.query(sql, [userId], (err, results) => {
      conn.release();
      if (err) {
        console.error("SQL 실행 시 오류 발생: ", err);
        res.status(500).send({ success: false, message: "SQL Error" });
        return;
      }
      console.log(results)
      res.send({ success: true, chatList: results });
    });
  });
});
// 질문 데이터 제공 라우트
router.get("/get_question/:chatId", (req, res) => {
  const chatId = req.params.chatId; // chatId를 URL 파라미터에서 추출
  console.log('/get_question 이벤트', chatId);

  pool.getConnection((err, conn) => {
    if (err) {
      console.error("Mysql getConnection error: ", err);
      res.status(500).send({ success: false, message: "Database connection failed" });
      return;
    }

    const sql = "SELECT * FROM initial_question WHERE chat_id = ?";
    conn.query(sql, [chatId], (err, results) => {
      conn.release();
      if (err) {
        console.error("SQL 실행 시 오류 발생: ", err);
        res.status(500).send({ success: false, message: "SQL Error" });
        return;
      }

      res.send({ success: true, questions: results });
    });
  });
});
router.get("/show_if_question/:iq_id", (req, res) => {
  const iq_id = req.params.iq_id;
  console.log('/show_if_question/:iq_id', iq_id);

  pool.getConnection((err, conn) => {
    if (err) {
      console.error("Mysql getConnection error: ", err);
      res.status(500).send({ success: false, message: "Database connection failed" });
      return;
    }

    const sql = "select * from extended_question where iq_id = ? order by eq_id desc;";
    conn.query(sql, [iq_id], (err, results) => {
      conn.release();
      if (err) {
        console.error("SQL 실행 시 오류 발생: ", err);
        res.status(500).send({ success: false, message: "SQL Error" });
        return;
      }

      res.send({ success: true, questions: results });
    });
  });
});

router.get('/get_tail_questions/:iq_id', (req, res) => {
  const iqId = req.params.iq_id;
  console.log('/get_tail_questions 이벤트' + iqId);

  pool.getConnection((err, conn) => {
    if (err) {
      console.error("Mysql getConnection error: ", err);
      res.status(500).send({ success: false, message: "Database connection failed" });
      return;
    }

    const sql = "SELECT * FROM initial_question WHERE iq_id = ?";
    conn.query(sql, [iqId], (err, results) => {
      conn.release();
      if (err) {
        console.error("SQL 실행 시 오류 발생: ", err);
        res.status(500).send({ success: false, message: "SQL Error" });
        return;
      }

      res.send({ success: true, questions: results });
    });
  });
})

router.get('/send_tail_questions/:iq_id', (req, res) => {
  const iqId = req.params.iq_id;
  const chatInputValue= req.query.chatInput;
  console.log('/send_tail_questions/ 이벤트' + iqId+ chatInputValue);
  console.log("넘긴데이터 : " + chatInputValue)
  console.log(req.body)
  let resultData = '';

  pool.getConnection((err, conn) => {
    if (err) {
      console.error("Mysql getConnection error: ", err);
      res.status(500).send({ success: false, message: "Database connection failed" });
      return;
    }

    const sql = "SELECT * FROM initial_question WHERE iq_id = ?";
    conn.query(sql, [iqId], (err, results) => {
      conn.release();
      if (err) {
        console.error("SQL 실행 시 오류 발생: ", err);
        res.status(500).send({ success: false, message: "SQL Error" });
        return;
      }
      if (results.length > 0) {
        let job_category = results[0].job_category
        let interview_type = results[0].interview_type
        let careerType = results[0].careerType

        const test_all = `${job_category} 직무의 ${interview_type}면접에 참가하게 된 ${careerType}입니다. ${ chatInputValue }`
        console.log("test_all:"+test_all)
        const pythonProcess = spawn('/opt/conda/bin/python', ['models/make_tail_question.py', test_all]);
        pythonProcess.stdout.on('data', (data) => {
          resultData = data.toString();
          console.log('꼬리질문 이벤트 체크' + resultData)
        });

        pythonProcess.stdout.on('data', (data) => {
          resultData = data.toString();
        });
   
        pythonProcess.on('close', (code) => {
          if (code !== 0) {
            res.status(500).json({ error: "Python script execution error" });
          } else {

            const insertExtendedSQL = "insert into extended_question(iq_id, eq_text, eq_answer, job_category, interview_type, careerType) values (?, ?, ?, ?, ?, ?);"
            conn.query(insertExtendedSQL,[results[0].iq_id, resultData, chatInputValue, job_category, interview_type,careerType],(err,insertExtRes)=>{
              if (err) {
                console.error("데이터 삽입 오류: ", err);
                res.status(500).send({ success: false, message: "Failed to insert data" });
              } else{
                res.json({ status: 'success', result: resultData.trim() });
                console.log('꼬리질문 이벤트 체크 colse 통과' + resultData)

              }
            })

          }
        });
      }
    });
  });



})


export default router;
