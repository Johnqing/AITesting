import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import parseRoutes from './parseRoutes.js';
import runRoutes from './runRoutes.js';
import reportRoutes from './reportRoutes.js';
import testCaseRoutes from './testCaseRoutes.js';
import testSuiteRoutes from './testSuiteRoutes.js';

const router = Router();

// 注册所有路由
router.use(healthRoutes);
router.use(parseRoutes);
router.use(runRoutes);
router.use(reportRoutes);
router.use(testCaseRoutes);
router.use(testSuiteRoutes);

export default router;

