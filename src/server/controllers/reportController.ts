import { Request, Response } from 'express';
import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 获取测试报告
 */
export async function getReport(req: Request, res: Response): Promise<void> {
  try {
    const { reportId } = req.params;
    const { format } = req.query;

    const reportsDir = 'reports';
    const jsonPath = join(reportsDir, `${reportId}.json`);
    const mdPath = join(reportsDir, `${reportId}.md`);

    if (format === 'markdown' || format === 'md') {
      if (existsSync(mdPath)) {
        const content = readFileSync(mdPath, 'utf-8');
        res.setHeader('Content-Type', 'text/markdown');
        res.send(content);
        return;
      }
    } else {
      if (existsSync(jsonPath)) {
        const content = JSON.parse(readFileSync(jsonPath, 'utf-8'));
        res.json({ success: true, data: content });
        return;
      }
    }

    res.status(404).json({ error: 'Report not found' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 列出所有测试报告
 */
export async function listReports(req: Request, res: Response): Promise<void> {
  try {
    const reportsDir = 'reports';
    if (!existsSync(reportsDir)) {
      res.json({ success: true, data: [] });
      return;
    }

    const files = readdirSync(reportsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = join(reportsDir, file);
        const stats = statSync(filePath);
        return {
          id: file.replace('.json', ''),
          filename: file,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
          size: stats.size
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

