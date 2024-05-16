import mysql from "mysql2";
import express from "express";
import dbconfig from "../config/dbconfig.json" assert { type: "json" };
import sendEmail from "../services/mailTest.js";

const router = express.Router();

const pool = mysql.createPool({
  connectionLimit: 10,
  host: dbconfig.host,
  user: dbconfig.user,
  password: dbconfig.password,
  database: dbconfig.database,
  debug: false,
});

// 사이드 챗봇에 맞게 여는 로직
router.get("/tail_page/:chat_list_id", (req, res) => {
  const { chat_list_id } = req.params;

  pool.getConnection((err, conn) => {
    if (err) {
      console.error("Mysql getConnection error: ", err);
      res
        .status(500)
        .send({ success: false, message: "데이터베이스 연결 실패" });
      return;
    }
    conn.query(
      "SELECT * FROM initial_questions WHERE chat_id = ?;",
      [chat_list_id],
      (err, rows) => {
        conn.release();
        if (err) {
          console.error("SQL 실행 시 오류 발생:", err);
          res.status(500).send({ success: false, message: "SQL Error" });
          return;
        }
        console.log(rows)
        res.json({ success: true, tail_list: rows });
      }
    );
  });
});

router.get("/api/dtail_other/:question_id", (req, res) => {
  const { question_id } = req.params;
  pool.getConnection((err, conn) => { // 데이터베이스 연결
    if (err) {
      console.error("MySQL getConnection error: ", err);
      res.status(500).send({ success: false, message: "데이터베이스 연결 실패" });
      return;
    }

    conn.query(
      "SELECT chat_id FROM initial_questions WHERE question_id = ?;",
      [question_id],
      (err, rows) => {
        if (err) {
          conn.release();
          console.error("SQL 실행 시 오류 발생:", err);
          res.status(500).send({ success: false, message: "SQL Error" });
          return;
        }

        if (rows.length > 0) {
          const chat_id = rows[0].chat_id; // chat_list_id 추출
          // 두 번째 쿼리 실행
          conn.query(
            "SELECT * FROM initial_questions WHERE chat_id = ?;",
            [chat_id],
            (err, questions) => {
              conn.release(); // 리소스 해제
              if (err) {
                console.error("SQL 실행 시 오류 발생:", err);
                res.status(500).send({ success: false, message: "SQL Error" });
                return;
              }
              res.json({ success: true, tail_list: questions }); // 모든 관련 질문 반환
             
            }
          );
        } else {
          conn.release();
          res.status(404).send({ success: false, message: "No questions found for this ID" });
        }
      }
    );
  });
});


export default router;
