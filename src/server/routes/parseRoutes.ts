import { Router } from 'express';
import { parseFile, parseString, parseDirectory } from '../controllers/parseController.js';

const router = Router();

router.post('/api/v1/parse/file', parseFile);
router.post('/api/v1/parse/string', parseString);
router.post('/api/v1/parse/directory', parseDirectory);

export default router;

