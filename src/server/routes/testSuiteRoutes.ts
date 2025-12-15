import { Router } from 'express';
import {
  getAllTestSuites,
  getTestSuiteById,
  upsertTestSuite,
  deleteTestSuite,
  executeTestSuite,
  getExecution,
  getSuiteExecutions,
} from '../controllers/testSuiteController.js';

const router = Router();

router.get('/api/v1/test-suites', getAllTestSuites);
router.get('/api/v1/test-suites/:suiteId', getTestSuiteById);
router.post('/api/v1/test-suites', upsertTestSuite);
router.put('/api/v1/test-suites/:suiteId', upsertTestSuite);
router.delete('/api/v1/test-suites/:suiteId', deleteTestSuite);
router.post('/api/v1/test-suites/:suiteId/execute', executeTestSuite);
router.get('/api/v1/test-suites/:suiteId/executions', getSuiteExecutions);
router.get('/api/v1/executions/:executionId', getExecution);

export default router;

