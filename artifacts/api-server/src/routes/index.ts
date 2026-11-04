import { Router, type IRouter } from "express";
import healthRouter from "./health";
import thoughtLinksRouter from "./thought-links";
import thoughtsRouter from "./thoughts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(thoughtLinksRouter);
router.use(thoughtsRouter);

export default router;
