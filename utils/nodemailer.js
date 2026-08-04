import nodemailer from "nodemailer";
import logger from "./logger.js";

// Credentials that were never configured - copy-pasted from .env.example.
// A placeholder Gmail address/password makes SMTP auth fail with a confusing
// 535 error, so treat them exactly like missing values.
const PLACEHOLDER_HINTS = [
  /your[_ ]?gmail/i,
  /your[_ ]?email/i,
  /your[_ ]?app[_ ]?password/i,
  /your[_ ]?password/i,
  /example/i,
  /placeholder/i,
  /^change[_-]?me$/i,
  /here$/i,
];

const isPlaceholder = (value) => {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_HINTS.some((re) => re.test(trimmed));
};

const hasSmtpCredentials = () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  return !!user && !!pass && !isPlaceholder(user) && !isPlaceholder(pass);
};

if (!hasSmtpCredentials()) {
  logger.warn(
    "SMTP is not configured (EMAIL_USER / EMAIL_PASS missing or placeholder). " +
      "Password reset emails will use a throwaway Ethereal account in dev and will fail with a 502 in production.",
  );
}

const sendEmail = async (options) => {
  const isProduction = process.env.NODE_ENV === "production";

  if (!hasSmtpCredentials() && isProduction) {
    // Never pretend a reset email was delivered in production - a silent
    // Ethereal fallback would return success while no email ever arrives.
    const error = new Error(
      "SMTP is not configured: set EMAIL_USER and EMAIL_PASS (e.g. a Gmail App Password) in production.",
    );
    error.code = "SMTP_NOT_CONFIGURED";
    throw error;
  }

  let transporter;

  if (!hasSmtpCredentials()) {
    // Dev/test fallback: generate a throwaway Ethereal account and log the
    // preview URL so reset emails can still be inspected.
    logger.warn(
      "No real SMTP credentials configured, generating a test Ethereal account...",
    );
    const testAccount = await nodemailer.createTestAccount();

    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false, // Use TLS for port 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }

  const message = {
    from: `${process.env.FROM_NAME || "Therabridge"} <${process.env.FROM_EMAIL || process.env.EMAIL_USER || "no-reply@therabridge.com"}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html, // Add this line to support HTML emails
  };

  const info = await transporter.sendMail(message);

  logger.info({ messageId: info.messageId, to: options.email }, "Message sent");

  if (!hasSmtpCredentials()) {
    logger.info(
      { previewUrl: nodemailer.getTestMessageUrl(info) },
      "Preview URL (open it to see the reset link)",
    );
  }
};

export default sendEmail;
