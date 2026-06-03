import express from "express";

import { getAppStats } from "../controllers/stats.controller";

const router = express.Router();

router.get("/stats", getAppStats);

export default router;

