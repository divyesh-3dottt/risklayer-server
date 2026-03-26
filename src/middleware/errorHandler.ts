import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { isApiError, createApiError } from "../utils/ApiError";

// express requires err, req, res, next to recognize error handling middleware
export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  let error = err;

  // If the error isn't an ApiError, transform it
  if (!isApiError(error)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    error = createApiError(statusCode, message, [], err.stack);
  }

  logger.error(`[Error] ${error.message}`, { stack: error.stack });

  res.status(error.statusCode).json({
    success: error.success,
    statusCode: error.statusCode,
    message: error.message,
    ...(error.errors.length > 0 && { errors: error.errors }),
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
};
