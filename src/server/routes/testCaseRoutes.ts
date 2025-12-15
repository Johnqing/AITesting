import { Router } from 'express';
import {
  getAllTestCases,
  getTestCaseById,
  upsertTestCase,
  deleteTestCase,
} from '../controllers/testCaseController.js';

const router = Router();

router.get('/api/v1/test-cases', getAllTestCases);
router.get('/api/v1/test-cases/:caseId', getTestCaseById);
router.post('/api/v1/test-cases', upsertTestCase);
router.put('/api/v1/test-cases/:caseId', upsertTestCase);
router.delete('/api/v1/test-cases/:caseId', deleteTestCase);

export default router;

