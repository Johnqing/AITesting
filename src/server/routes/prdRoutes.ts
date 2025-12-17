import { Router } from 'express';
import {
  getAllPRDs,
  getPRDById,
  upsertPRD,
  deletePRD,
  generateTestCasesFromPRD,
  getGeneratedTestCases,
  uploadPRDFile,
  exportPRDAsMarkdown,
} from '../controllers/prdController.js';
import multer from 'multer';

const router = Router();

// 配置 multer 用于文件上传（内存存储）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    // 支持 .md 和 .markdown 文件
    const fileName = file.originalname.toLowerCase();
    if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .md 或 .markdown 文件'));
    }
  }
});

router.get('/api/v1/prds', getAllPRDs);
router.get('/api/v1/prds/:prdId', getPRDById);
router.get('/api/v1/prds/:prdId/export', exportPRDAsMarkdown); // 导出PRD为Markdown
router.post('/api/v1/prds', upsertPRD);
router.put('/api/v1/prds/:prdId', upsertPRD);
router.delete('/api/v1/prds/:prdId', deletePRD);
router.post('/api/v1/prds/:prdId/generate-test-cases', generateTestCasesFromPRD);
router.get('/api/v1/prds/:prdId/test-cases', getGeneratedTestCases);
router.post('/api/v1/prds/upload', upload.single('file'), uploadPRDFile);

export default router;

