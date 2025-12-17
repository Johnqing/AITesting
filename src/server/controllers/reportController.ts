import { Request, Response } from 'express';
import { testReportService } from '../../db/index.js';
import { Reporter } from '../../reporter/reporter.js';

/**
 * 获取测试报告
 */
export async function getReport(req: Request, res: Response): Promise<void> {
  try {
    const { reportId } = req.params;
    const { format } = req.query;

    // 从数据库获取报告
    const report = await testReportService.getTestReportByReportId(reportId);
    if (!report) {
      res.status(404).json({ 
        success: false,
        error: 'Report not found' 
      });
      return;
    }

    if (format === 'markdown' || format === 'md') {
      const reporter = new Reporter();
      const markdown = reporter.generateMarkdownReport(report);
      res.setHeader('Content-Type', 'text/markdown');
      res.send(markdown);
    } else {
      res.json({ success: true, data: report });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 列出所有测试报告（仅从数据库）
 */
export async function listReports(req: Request, res: Response): Promise<void> {
  try {
    // 从数据库获取所有报告
    const dbReports = await testReportService.getAllTestReports();
    
    const reports = dbReports.map(r => ({
      id: r.reportId,
      filename: `${r.reportId}.md`,
      createdAt: r.createdAt.toISOString(),
      modifiedAt: r.updatedAt.toISOString(),
      size: 0, // 报告存储在数据库中，没有文件大小概念
    }));

    res.json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 根据用例集执行ID获取测试报告
 */
export async function getExecutionReport(req: Request, res: Response): Promise<void> {
  try {
    const { executionId } = req.params;
    
    const result = await testReportService.getTestReportByExecutionId(executionId);
    if (!result) {
      res.status(404).json({
        success: false,
        error: '执行记录不存在',
      });
      return;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
