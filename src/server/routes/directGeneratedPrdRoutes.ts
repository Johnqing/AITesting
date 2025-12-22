import { Router } from 'express';
import {
  getAllDirectGeneratedPRDs,
  getDirectGeneratedPRDById,
  getDirectGeneratedPRDsBySourcePrdId,
  deleteDirectGeneratedPRD,
  updateDirectGeneratedPRD
} from '../controllers/directGeneratedPrdController.js';

const router = Router();

// 产品需求管理路由
router.get('/api/v1/direct-generated-prds', getAllDirectGeneratedPRDs);
router.get('/api/v1/direct-generated-prds/source/:sourcePrdId', getDirectGeneratedPRDsBySourcePrdId);
router.get('/api/v1/direct-generated-prds/:id', getDirectGeneratedPRDById);
router.put('/api/v1/direct-generated-prds/:id', updateDirectGeneratedPRD);
router.delete('/api/v1/direct-generated-prds/:id', deleteDirectGeneratedPRD);

export default router;

