import crypto from "crypto";
import sendEmail from "../utils/nodemailer.js";

// Email verification: 6-digit code, valid for 30 minutes, hashed at rest.
export const VERIFICATION_CODE_TTL_MS = 30 * 60 * 1000;

export const generateVerificationCode = () =>
  crypto.randomInt(0, 1000000).toString().padStart(6, "0");

export const hashVerificationCode = (code) =>
  crypto.createHash("sha256").update(code).digest("hex");

export const sendVerificationEmail = async (user, code) => {
  const message = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { margin:0; padding:0; background:#f8fafc; font-family:'Inter',system-ui,sans-serif; color: #1f2937; }
        .email-container { max-width: 620px; margin: 40px auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 40px rgba(0,0,0,0.07); }
        .header { background: linear-gradient(135deg, #10b981, #059669); padding: 50px 40px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; }
        .header p { margin: 12px 0 0; font-size: 17px; opacity: 0.95; }
        .content { padding: 45px 40px; }
        .greeting { font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 12px 0; }
        .message { color: #374151; line-height: 1.75; font-size: 16.5px; margin-bottom: 25px; }
        .code-box { text-align: center; margin: 35px 0; }
        .code { display: inline-block; background: #ecfdf5; border: 2px dashed #10b981; color: #065f46; padding: 20px 45px; font-size: 42px; font-weight: 700; letter-spacing: 12px; border-radius: 16px; }
        .warning { background: #fefce8; border-left: 5px solid #eab308; padding: 20px; border-radius: 12px; margin: 30px 0; color: #854d0e; font-size: 15px; line-height: 1.6; }
        .footer { background: #f1f5f9; padding: 35px 40px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Therabridge</h1>
            <p>Verify your email</p>
        </div>
        <div class="content">
            <p class="greeting">Hey ${user.firstName || "there"},</p>
            <p class="message">
                Thanks for joining Therabridge. Enter the code below in the app to verify your email address and activate your account.
            </p>
            <div class="code-box">
                <span class="code">${code}</span>
            </div>
            <p class="message" style="text-align:center; color:#6b7280; font-size:14px;">
                This code expires in <strong>30 minutes</strong>.
            </p>
            <div class="warning">
                <strong>Didn't request this?</strong><br>
                If you didn't create an account with this email, you can safely ignore this message.
            </div>
        </div>
        <div class="footer">
            <p><strong>Therabridge</strong> • Your mental wellness companion</p>
            <p>&copy; ${new Date().getFullYear()} Therabridge. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;

  await sendEmail({
    email: user.email,
    subject: "Verify Your Email - Therabridge",
    html: message,
  });
};

// Generates a fresh 6-digit code, stores its hash on the user, and emails it.
// Returns the plaintext code only for immediate use (register) - the hashed
// copy is what gets stored and later compared.
export const issueVerificationCode = async (user) => {
  const code = generateVerificationCode();
  user.verificationCode = hashVerificationCode(code);
  user.verificationCodeExpire = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
  await user.save();
  await sendVerificationEmail(user, code);
};

export const updateLoginStreak = async (user) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastLogin = user.lastLoginDate ? new Date(user.lastLoginDate) : null;

  if (lastLogin) {
    lastLogin.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - lastLogin) / 86400000);
    if (diffDays === 0) return;
    if (diffDays === 1) {
      user.loginStreak = (user.loginStreak || 0) + 1;
    } else {
      user.loginStreak = 1;
    }
  } else {
    user.loginStreak = 1;
  }

  if (user.loginStreak > (user.longestLoginStreak || 0)) {
    user.longestLoginStreak = user.loginStreak;
  }

  user.lastLoginDate = new Date();
  await user.save();
};
