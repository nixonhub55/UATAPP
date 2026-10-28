
import "dotenv/config";
import nodemailer from "nodemailer";

async function testMailer() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error(
      "GMAIL_USER or GMAIL_APP_PASSWORD is missing from .env"
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, ""),
    },
  });

  console.log("Checking Gmail connection...");

  await transporter.verify();

  console.log("Gmail connection successful!");

  /* const info = await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    subject: "UAT Monitoring System - Mailer Test",
    text: "Success! Your UAT Monitoring System can send email through Gmail.",
  }); */

    const info = await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: "yejog89887@hopefunder.com",
        subject: "UAT Monitoring System - Mailer Test",
        text: "Success! This is a test email from your UAT Monitoring System.",
    });

  console.log("Test email sent:", info.messageId);
}

testMailer().catch((error) => {
  console.error("Mailer test failed:", error.message);
  process.exitCode = 1;
});
