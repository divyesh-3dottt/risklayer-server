import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import db from "../config/db";
import { logger } from "../utils/logger";

const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_jwt_key";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    
    // Check if user exists in DB to prevent foreign key violations on scans
    const userExists = await db.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true }
    });

    if (!userExists) {
      res.status(401).json({ error: "Unauthorized: User no longer exists" });
      return;
    }

    req.user = decoded;
    next();
  } catch (error) {
    logger.error("JWT Verification failed", error);
    res.status(401).json({ error: "Unauthorized: Token expired or invalid" });
  }
};
