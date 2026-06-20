import nodemailer from 'nodemailer';

const sendEmail = async (options) => {
  let transporter;

  // Fallback to ethereal if no credentials are provided
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("No email credentials found in .env, generating a test ethereal account...");
    const testAccount = await nodemailer.createTestAccount();
    
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user, 
        pass: testAccount.pass, 
      },
    });
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: false, // Use TLS for port 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  const message = {
    from: `${process.env.FROM_NAME || 'AIDO Group'} <${process.env.FROM_EMAIL || process.env.EMAIL_USER || 'no-reply@aidogroup.com'}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html, // Add this line to support HTML emails
  };

  const info = await transporter.sendMail(message);
  
  console.log('Message sent: %s', info.messageId);
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("Preview URL (Open this right now to see the reset link!): %s", nodemailer.getTestMessageUrl(info));
  }
};

export default sendEmail;