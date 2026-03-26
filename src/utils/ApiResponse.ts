import { Response } from "express";

export function sendResponse<T>(res: Response, statusCode: number, message: string = "Success", data?: T) {
  return res.status(statusCode).json({
    success: statusCode < 400,
    statusCode,
    message,
    ...(data !== undefined && { data }),
  });
}
