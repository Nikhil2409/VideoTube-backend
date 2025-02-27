import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorHandler } from "./middlewares/errors.middlewares.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Load environment variables
dotenv.config();

// Debug environment variables
console.log("Environment variables check:");
console.log("ACCESS_TOKEN_SECRET:", process.env.ACCESS_TOKEN_SECRET ? "Set" : "Not set");
console.log("REFRESH_TOKEN_SECRET:", process.env.REFRESH_TOKEN_SECRET ? "Set" : "Not set");
console.log("ACCESS_TOKEN_EXPIRY:", process.env.ACCESS_TOKEN_EXPIRY);
console.log("REFRESH_TOKEN_EXPIRY:", process.env.REFRESH_TOKEN_EXPIRY);
console.log("CORS_ORIGIN:", process.env.CORS_ORIGIN);

const app = express();

// Define __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure CORS - fixed to have only one CORS configuration
app.use(
  cors({
    origin: "http://localhost:5173", // Remove trailing slash
    credentials: true,
  })
);

// Configure middleware
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// Static files - moved to a single declaration before routes
app.use(express.static(path.join(__dirname, "public")));

// Import routes
import healthcheckRouter from "./routes/healthcheck.routes.js";
import userRouter from "./routes/user.routes.js";

// Define routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API routes
app.use("/api/v1/healthcheck", healthcheckRouter);
app.use("/api/v1/users", userRouter);

// Test route to check if API is working
app.get("/api/test", (req, res) => {
  res.json({ message: "API is working!" });
});

// Error handler middleware
app.use(errorHandler);

export { app };