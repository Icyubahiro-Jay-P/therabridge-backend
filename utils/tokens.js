import jwt from "jsonwebtoken";
import crypto from "crypto";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "7d";
export const TWO_FACTOR_TOKEN_TTL = "5m";
export const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const TWO_FACTOR_TOKEN_MAX_AGE = 5 * 60 * 1000;

export const hashRefreshToken = (jti) =>
  crypto.createHash("sha256").update(String(jti)).digest("hex");

export const signAccessToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );

export const signTwoFactorToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, type: "2fa-pending" },
    process.env.JWT_SECRET,
    { expiresIn: TWO_FACTOR_TOKEN_TTL },
  );

export const createRefreshToken = (user) => {
  const jti = crypto.randomBytes(24).toString("hex");
  const token = jwt.sign(
    { id: user._id, role: user.role, type: "refresh", jti },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL },
  );
  return { token, jti };
};

const cookieOptions = (maxAge, isSecure) => ({
  httpOnly: true,
  secure: isSecure,
  sameSite: isSecure ? "none" : "lax",
  maxAge,
});

const isRequestSecure = (req) => {
  if (!req) return false;
  if (req.secure) return true;
  const proto = req.headers?.["x-forwarded-proto"] ?? "";
  return proto.split(",")[0].trim() === "https";
};

export const setAuthCookies = (res, { accessToken, refreshToken }) => {
  const isSecure = isRequestSecure(res.req);
  res.cookie("token", accessToken, cookieOptions(ACCESS_TOKEN_MAX_AGE, isSecure));
  res.cookie(
    "refreshToken",
    refreshToken,
    cookieOptions(REFRESH_TOKEN_MAX_AGE, isSecure),
  );
};

export const clearAuthCookies = (res) => {
  const isSecure = isRequestSecure(res.req);
  const options = { ...cookieOptions(0, isSecure), maxAge: undefined };
  res.clearCookie("token", options);
  res.clearCookie("refreshToken", options);
};
