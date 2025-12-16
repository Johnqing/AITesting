import { Router } from 'express';
import {
  getAllPRDs,
  getPRDById,
  upsertPRD,
  deletePRD,
  generateTestCasesFromPRD,
  getGeneratedTestCases,
  uploadPRDFile,
} from '../controllers/prdController.js';

const router = Router();

router.get('/api/v1/prds', getAllPRDs);
router.get('/api/v1/prds/:prdId', getPRDById);
router.post('/api/v1/prds', upsertPRD);
router.put('/api/v1/prds/:prdId', upsertPRD);
router.delete('/api/v1/prds/:prdId', deletePRD);
router.post('/api/v1/prds/:prdId/generate-test-cases', generateTestCasesFromPRD);
router.get('/api/v1/prds/:prdId/test-cases', getGeneratedTestCases);
router.post('/api/v1/prds/upload', uploadPRDFile);

export default router;

