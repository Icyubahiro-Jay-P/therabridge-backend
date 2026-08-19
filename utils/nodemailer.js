import logger from "./logger.js";

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

const sendEmail = async ({ email, subject, html }) => {
  if (!GOOGLE_SCRIPT_URL) {
    logger.warn(
      { to: email, subject },
      "GOOGLE_SCRIPT_URL is not set. Email was NOT delivered.",
    );
    return;
  }

  const res = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: email, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Apps Script returned ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "Google Apps Script reported an error");
  }

  logger.info({ to: email, subject }, "Email sent via Google Apps Script");
};

export default sendEmail;
