import { Router } from "express";
import { startScan, getScanStatus, getScanPreview, getUserScans } from "../controllers/scan.controller";
import { requireAuth } from "../middleware/auth";

const scanRouter = Router();

// All scan routes require authentication
scanRouter.use(requireAuth);

// Endpoint to get user scans
scanRouter.get("/", getUserScans);

// Endpoint to start a new scan
scanRouter.post("/start", startScan);

// Endpoint to check scan status
scanRouter.get("/:id/status", getScanStatus);

// Endpoint to get scan results (preview)
scanRouter.get("/:id/preview", getScanPreview);

export default scanRouter;
