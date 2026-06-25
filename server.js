import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./db/connectDB.js";
import userRoutes from "./routes/user.route.js";
import exerciseRoutes from "./routes/exercise.route.js";
import chatRoutes from "./routes/chat.route.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ====================== MIDDLEWARE ======================
app.use(
  cors({
    credentials: true,
    origin:[process.env.CLIENT_URL || "http://localhost:5173", "https://therabridge.vercel.app"],
  })
);
app.use(express.json());
app.use(cookieParser());

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ====================== ROUTES ======================
app.use("/api/users", userRoutes);
app.use("/api/exercises", exerciseRoutes);
app.use("/api/chat", chatRoutes);

// Health check
app.get("/", (req, res) => {
  res.status(200).json({ message: "Therabridge API is running!" });
});

// ====================== START SERVER ======================
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Therabridge server running on port ${PORT}`);
  });
});