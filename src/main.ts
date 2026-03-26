import "./config/loadEnv";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler";
import { DBConnection } from "./config/db";
import { logger } from "./utils/logger";
import { sendResponse } from "./utils/ApiResponse";
import rootRouter from "./routes";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 🔹 Request Logging Middleware
app.use(
  morgan("dev", {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);

// 🔹 Test DB connection on startup
DBConnection();
// --- Health Check ---
app.get("/health", (req, res) => {
  sendResponse(res, 200, "Server is healthy", { timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  sendResponse(res, 200, "Backend running");
});

// Routes
app.use("/api", rootRouter);

// --- Error Handling Middleware ---
// MUST be defined last
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
