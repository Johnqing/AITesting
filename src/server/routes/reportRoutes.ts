import { Router } from 'express';
import { getReport, listReports } from '../controllers/reportController.js';

const router = Router();

router.get('/api/v1/reports', listReports);
router.get('/api/v1/reports/:reportId', getReport);

export default router;

