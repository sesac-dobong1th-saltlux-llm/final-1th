import nodemailer from "nodemailer";
import express from "express";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail", // gmail을 사용함
  port: 5878,
  auth: {
    user: process.env.MYEMAIL, // 나의 (작성자) 이메일 주소
    pass: process.env.MYPASS, // 이메일의 비밀번호 몰래 로그인하면 대머리
  },
});


async function sendEmail({ to, subject, text }) {
  
  const mailOptions = {
        from: '"꼬질 봇에 오신걸 환영합니다 👻" <tmddn3410@gmail.com>', // sender address
        to: to,
        subject: subject,
        text: text
    };

    await transporter.sendMail(mailOptions);
}

export default sendEmail;
