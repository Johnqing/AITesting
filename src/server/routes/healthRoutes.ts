import { Router } from 'express';
import { healthCheck, apiInfo } from '../controllers/healthController.js';

const router = Router();

router.get('/health', healthCheck);
router.get('/api/v1/info', apiInfo);

export default router;

