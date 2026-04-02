import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import satomiRouter from "./satomi/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/satomi", satomiRouter);

export default router;
