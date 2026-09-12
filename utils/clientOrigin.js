import allowedOrigins from "../config/allowedOrigins.js";

// Used to build links we email to users (e.g. password reset), so it must
// never echo back an unvalidated header — an attacker can send a request
// with no Origin (passes CORS) and a forged Referer, redirecting the emailed
// link to a host they control. Only a match against the same trusted
// allowlist CORS uses is returned; anything else falls back to CLIENT_URL.
const getClientOrigin = (req) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    return origin.replace(/\/+$/, "");
  }
  return (process.env.CLIENT_URL || "http://localhost:5173").replace(
    /\/+$/,
    "",
  );
};

export default getClientOrigin;
