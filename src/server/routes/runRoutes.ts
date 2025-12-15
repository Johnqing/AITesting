import { Router } from 'express';
import { runAll, runFile, runTestCase, runString } from '../controllers/runController.js';

const router = Router();

router.post('/api/v1/run/all', runAll);
router.post('/api/v1/run/file', runFile);
router.post('/api/v1/run/testcase', runTestCase);
router.post('/api/v1/run/string', runString);

export default router;

