import { Request, Response } from 'express';

/**
 * 健康检查控制器
 */
export function healthCheck(req: Request, res: Response): void {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}

/**
 * API 信息控制器
 */
export function apiInfo(req: Request, res: Response): void {
  res.json({
    name: 'TestFlow API',
    version: '1.0.0',
    description: 'AI-driven Playwright automation testing system API'
  });
}

