import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

if (!process.env.DATABASE_URL) {
  logger.error("DATABASE_URL is not defined in the environment variables.");
  process.exit(1);
}

// 2. Configure Prisma Client
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["error"],
});

// 3. Test connection immediately when server starts
export const DBConnection = async () => {
  try {
    await prisma.$connect();
    logger.info("Database connected");
  } catch (error) {
    logger.error("Database connection failed. Please check your DATABASE_URL:", error);
    process.exit(1); // Exit process if DB connection is strictly required
  }
};

export default prisma;
