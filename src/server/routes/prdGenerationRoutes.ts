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
  exportPRDAsMarkdown
} from '../controllers/prdGenerationController.js';

const router = Router();

// PRD生成相关路由
router.post('/api/v1/prd/generate', startPRDGeneration);
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

