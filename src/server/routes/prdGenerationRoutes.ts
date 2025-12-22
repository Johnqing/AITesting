import { Router } from 'express';
import {
  startPRDGeneration,
  getGenerationStatus,
  continueConversation,
  getMessages,
  getGenerationResult,
  getSchema,
  regenerateParagraph,
  streamConversation,
  saveGeneratedPRD,
  exportPRDAsMarkdown,
  generatePRDDirect,
  saveDirectGeneratedPRD
} from '../controllers/prdGenerationController.js';

const router = Router();

// PRD生成相关路由
router.post('/api/v1/prd/generate', startPRDGeneration);
router.post('/api/v1/prd/generate-direct', generatePRDDirect); // 直接从需求说明生成PRD
router.post('/api/v1/prd/generate-direct/save', saveDirectGeneratedPRD); // 保存直接生成的PRD到单独的表
router.get('/api/v1/prd/generate/:taskId/status', getGenerationStatus);
router.post('/api/v1/prd/generate/:taskId/continue', continueConversation);
router.get('/api/v1/prd/generate/:taskId/messages', getMessages);
router.get('/api/v1/prd/generate/:taskId/stream', streamConversation); // SSE流式推送
router.get('/api/v1/prd/generate/:taskId/result', getGenerationResult);
router.get('/api/v1/prd/generate/:taskId/schema', getSchema);
router.get('/api/v1/prd/generate/:taskId/export', exportPRDAsMarkdown); // 导出PRD为Markdown
router.post('/api/v1/prd/generate/:taskId/save', saveGeneratedPRD); // 保存生成的PRD
router.post('/api/v1/prd/generate/:taskId/regenerate-paragraph', regenerateParagraph);

export default router;

