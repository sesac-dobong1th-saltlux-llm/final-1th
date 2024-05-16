import mysql from "mysql2";
import express, { application } from "express";
import dbconfig from "../config/dbconfig.json" assert { type: "json" };
import sendEmail from "../services/mailTest.js";
const router = express.Router();
const pool = mysql.createPool({
    connectionLimit: 100,
    host: dbconfig.host,
    user: dbconfig.user,
    password: dbconfig.password,
    database: dbconfig.database,
    debug: false,
  });
// /dashBord1 event
router.get('/api/chat-data', async (req, res) => {
  console.log("/api/chat-data");
  pool.getConnection((err, conn) => {
      if (err) {
          console.error("Mysql getConnection error: ", err);
          res.status(500).send({ success: false, message: "Database connection failed" });
          return;
      }
      // 데이터베이스에서 데이터 가져오기
      const queryText = `
      with A as (
        select c.chat_id, count(1) as cnt
        from chat as c, initial_question as i, extended_question as e
        where c.chat_id = i.chat_id and i.iq_id = e.iq_id
        group by c.chat_id
    ) 
    select case
        when CNT < 2 then '2건 미만'
        when CNT < 4 then '4건 미만'
        when CNT < 6 then '6건 미만'
        when CNT < 8 then '8건 미만'
        when CNT < 10 then '10건 미만'
        else '10건 이상'
    end as XX, 
    COUNT(chat_id) as yy
    from A 
    group by XX
    order by 
        case XX
            when '2건 미만' then 1
            when '4건 미만' then 2
            when '6건 미만' then 3
            when '8건 미만' then 4
            when '10건 미만' then 5
            else 6
        end;
    
      `;
      conn.query(queryText, (err, results) => {
          conn.release();
          if (err) {
              console.error("SQL 실행 시 오류 발생: ", err);
              res.status(500).send({ success: false, message: "SQL Error" });
              return;
          }
          console.log(results);
          res.json(results); // 결과를 JSON 형식으로 클라이언트에 전송
      });
  });
});


export default router;