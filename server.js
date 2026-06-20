import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectDB } from "./db/connectDB.js";
import userRoutes from "./routes/user.route.js";

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors({
  credentials: true,
  origin: process.env.CLIENT_URL
}));

app.use(express.json());

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});

router.get("/", (req, res) => {
  res.status(200).json({ message: "User API is running 🔥" });
});