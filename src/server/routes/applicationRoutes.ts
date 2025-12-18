import { Router } from 'express';
import {
  getAllApplications,
  getApplicationByAppId,
  createApplication,
  updateApplication,
  deleteApplication
} from '../controllers/applicationController.js';

const router = Router();

// 应用管理相关路由
router.get('/api/v1/applications', getAllApplications);
router.get('/api/v1/applications/:appId', getApplicationByAppId);
router.post('/api/v1/applications', createApplication);
router.put('/api/v1/applications/:appId', updateApplication);
router.delete('/api/v1/applications/:appId', deleteApplication);

export default router;

