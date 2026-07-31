const getClientOrigin = (req) => {
  const origin = req.headers.origin || req.headers.referer;
  if (origin) {
    return origin.replace(/\/+$/, "");
  }
  return (process.env.CLIENT_URL || "http://localhost:5173").replace(
    /\/+$/,
    "",
  );
};

export default getClientOrigin;
