// Single source of truth for which frontend origins this API trusts —
// used both by CORS and by anything that builds a URL to email/redirect to
// (e.g. password-reset links), so the two checks can never drift apart.
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
  "https://therabridge.vercel.app",
].filter(Boolean);

export default allowedOrigins;
