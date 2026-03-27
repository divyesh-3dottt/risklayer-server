import nodemailer from "nodemailer";
import { logger } from "./logger";

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // Use STARTTLS
      family: 4, // Forces IPv4 to avoid ENETUNREACH errors on IPv6 addresses
      auth: {
        user: process.env.EMAIL_USER?.trim(),
        pass: process.env.EMAIL_PASS?.replace(/\s+/g, ""), // Remove spaces in App password
      },
      tls: {
        rejectUnauthorized: false, // Added for some hosting environments
      },
    });

    const mailOptions = {
      from: `"RiskLayer" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Error sending email to ${to}:`, error);
    throw error; // Re-throw so controllers can handle it if needed
  }
};
