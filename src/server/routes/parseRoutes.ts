import { Router } from 'express';
import { parseFile, parseString, parseDirectory, parseXmindFile } from '../controllers/parseController.js';
import multer from 'multer';

const router = Router();

// 配置 multer 用于文件上传（内存存储）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.xmind')) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xmind 文件'));
    }
  }
});

router.post('/api/v1/parse/file', parseFile);
router.post('/api/v1/parse/string', parseString);
router.post('/api/v1/parse/directory', parseDirectory);
router.post('/api/v1/parse/xmind', upload.single('file'), parseXmindFile);

export default router;

