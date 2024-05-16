import express from "express";
import { spawn } from "child_process";
import http from "http";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import { rejects } from "assert";
import { createPool } from "mysql2";
import mysql from "mysql2";
import dbconfig from "../config/dbconfig.json" assert { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();


const pool = mysql.createPool({
    connectionLimit: 100,
    host: dbconfig.host,
    user: dbconfig.user,
    password: dbconfig.password,
    database: dbconfig.database,
    debug: false,
});

// 메모리에 결과를 저장하기 위한 변수
let lastResult = '';

// 사용자 정보를 토대로 질문을 요약
// '/make_question' 라우트
router.post("/make_question", (req, res) => {
    const { introduction } = req.body;
    const pythonProcess = spawn('/opt/conda/bin/python', [
        'models/summary.py',
        req.session.userChoices.card, req.session.userChoices.interviewType, req.session.userChoices.careerType, introduction
    ]);

    let outputData = '';
    let errors = '';

    pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errors += data.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error('Error or Warning:', errors);
            res.status(500).json({ error: errors });
            return;
        }

        const postData = JSON.stringify({ question: outputData.trim() });
        console.log("질문 요약 이벤트 확인: " + postData);

        createChat(req.session.user.id, introduction, outputData, req.session.userChoices.card, req.session.userChoices.interviewType, req.session.userChoices.careerType)
            .then(chat_id  => {
                const options = {
                    hostname: 'localhost',
                    port: 80,
                    path: '/submit-question',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const postReq = http.request(options, (postRes) => {
                    let responseData = '';
                    postRes.on('data', (chunk) => {
                        responseData += chunk;
                    });
                    postRes.on('end', () => {
                        try {
                            //const parsedData = JSON.parse(responseData);
                            // console.log('질문생성 위치 확인' + responseData);
                            // console.log('추출된 질문들: ', parsedData);
                            // console.log(parsedData.result.split("\n\n\n").slice(-1)[0]);
                            //res.json({ response: responseData }); // 클라이언트에 최종 결과 전송
                            // const correctedResponseData = responseData.replace(/"\[/g, '["').replace(/\]"/g, '"]').replace(/\\"/g, '"').replace(/"([^"]+)"(:)/g, '\"$1\"$2');
                            // console.log(correctedResponseData);
                
                            // // JSON 파싱
                            // const parsedData = JSON.parse(correctedResponseData);
                            // const questions = parsedData.result.map(question =>
                            //     question.replace(/\s*답변:\s*$/, '').trim()
                            // );
                
                            // console.log("추출된 질문들:", questions);
                            console.log("Server response data:", responseData);
                            const parsedData = JSON.parse(responseData);  // 직접 responseData를 파싱
                            // String 형태의 배열을 실제 배열로 변환
                            
                            // json은 홑따옴표만 가능 세상 시간 엄청날렸죠?
                            const fixedResult = parsedData.result.replace(/'/g, '"');
                            const questions = JSON.parse(fixedResult); 

                            
                            console.log("Extracted questions:", questions);
                            
                            // 데이터베이스에 저장
                            questions.forEach((question, index) => {
                                insertQuestion(chat_id, index, question, req.session.userChoices.card, req.session.userChoices.interviewType,  req.session.userChoices.careerType).then(result => {
                                    console.log("질문 저장 완료:", question);
                                }).catch(err => {
                                    console.error("질문 저장 실패:", err);
                                });
                            });
                            
                            res.redirect(`/user/${req.session.user.id}/${chat_id}`);
                        } catch (error) {
                            console.error('JSON 파싱 에러:', error);
                            res.status(500).send('Internal Server Error');
                        }
                    });
                });

                postReq.on('error', (e) => {
                    console.error(`Problem with request: ${e.message}`);
                    res.status(500).send('Internal Server Error');
                });

                postReq.setTimeout(300000, () => {  // 5분(300초) 후 타임아웃 설정
                    postReq.abort();
                    res.status(504).send('Gateway Timeout');
                });

                postReq.write(postData);
                postReq.end();
            })
            .catch(error => {
                res.status(500).send({ success: false, message: error.message });
            });
    });
});


// '/submit-question' 라우트
router.post('/submit-question', (req, res) => {
    const { question } = req.body;
    console.log('/submit-question question 확인: ' + question)
    let resultData = '';

    const pythonProcess = spawn('/opt/conda/bin/python', ['models/make_question.py', question]);
    pythonProcess.stdout.on('data', (data) => {
        resultData += data.toString();
        console.log('요약되고 모델질문 이벤트 체크' + resultData)
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            res.status(500).json({ error: "Python script execution error" });
        } else {
            res.json({ status: 'success', result: resultData.trim() });
            console.log('요약되고 모델질문 이벤트 체크 colse 통과' + resultData)
        }
    });
});

// 이아래부터는 sql문

/**
 채팅방 개설 함수 인자로 아이디, 자기소개, 요약, 7개 직군, 신입/경력 
*/
function createChat(user_login_id, introduction, chat_summary, job_category, interviewType, careerType) {
    return new Promise((resolve, reject) => {  // 오타 수정: rejects -> reject
        pool.getConnection((err, conn) => {
            if (err) {
                if (conn) conn.release();
                console.error("MySQL getConnection error: ", err);
                reject(new Error("Database connection failed"));
                return;
            }
            console.log("데이터베이스 연결됨");

            // 제거할 시작 문장
            const removeText = "MM 직무의 직무면접에 참가하게 된 신입입니다. ";
            // 시작 문장이 있다면 제거
            if (chat_summary.startsWith(removeText)) {
                chat_summary = chat_summary.substring(removeText.length);
            }
            const sql = "INSERT INTO chat(user_login_id, introduction, chat_summary, job_category, interview_type, careerType) VALUES (?, ?, ?, ?, ?, ?);";
            conn.query(sql, [user_login_id, introduction, chat_summary, job_category, interviewType, careerType], (err, results) => {
                conn.release();
                if (err) {
                    console.error("SQL 실행 시 오류 발생: ", err);
                    reject(new Error("SQL Error"));
                    return;
                }
                const chatId = results.insertId;
                
                console.log("Insert 성공, chat_id:", chatId);
                resolve(chatId);  // chat_id 반환
            });
        });
    });
}

/**
 문제 저장 함수 인자로는 chat생성할때id, (0,1,2 의 숫자) ,(질문들), 7개 직군, 신입/경력 
 */
function insertQuestion(chat_id,iq_code, iq_text, job_category, interviewType, careerType) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
            if (err) {
                if (conn) conn.release();
                console.error("MySQL getConnection error: ", err);
                reject(new Error("Database connection failed"));
                return;
            }
            console.log("데이터베이스 연결됨");


            const sql = "insert into initial_question(chat_id, iq_code, iq_text, job_category, interview_type, careerType) values (?,?,?,?,?,?);"
            conn.query(sql, [chat_id, iq_code, iq_text, job_category, interviewType, careerType], (err, results) => {
                conn.release();
                if (err) {
                    console.error("SQL 실행 시 오류 발생: ", err);
                    reject(new Error("SQL Error"));
                    return;
                }
                console.log("Insert 성공:", results);
                resolve(results);  // 성공적으로 데이터 삽입 완료
            });
        })
    })
}


export default router;