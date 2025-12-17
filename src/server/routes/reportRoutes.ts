import { Router } from 'express';
import { getReport, listReports, getExecutionReport } from '../controllers/reportController.js';

const router = Router();

router.get('/api/v1/reports', listReports);
router.get('/api/v1/reports/:reportId', getReport);
router.get('/api/v1/executions/:executionId/report', getExecutionReport);

export default router;

