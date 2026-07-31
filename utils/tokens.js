import jwt from "jsonwebtoken";
import crypto from "crypto";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "7d";
export const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const hashRefreshToken = (jti) =>
  crypto.createHash("sha256").update(String(jti)).digest("hex");

export const signAccessToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
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

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge,
});

export const setAuthCookies = (res, { accessToken, refreshToken }) => {
  res.cookie("token", accessToken, cookieOptions(REFRESH_TOKEN_MAX_AGE));
  res.cookie(
    "refreshToken",
    refreshToken,
    cookieOptions(REFRESH_TOKEN_MAX_AGE),
  );
};

export const clearAuthCookies = (res) => {
  res.clearCookie("token");
  res.clearCookie("refreshToken");
};
