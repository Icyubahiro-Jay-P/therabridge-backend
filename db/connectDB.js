import mongoose from "mongoose";

export const connectDB = async () => {
  console.log("Connecting to MongoDB...");
  
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
};