import { Router } from "express";
import authRouter from "./auth.routes";
import scanRouter from "./scan.routes";

const rootRouter = Router();

rootRouter.use("/auth", authRouter);
rootRouter.use("/scan", scanRouter);

export default rootRouter;
