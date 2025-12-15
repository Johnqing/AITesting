import { Request, Response } from 'express';
import { TestService } from '../testService.js';
import { Reporter } from '../../reporter/reporter.js';
import { validateEnv } from '../../utils/env.js';

/**
 * 运行所有测试用例
 */
export async function runAll(req: Request, res: Response): Promise<void> {
  try {
    validateEnv();

    const { caseDir, outputDir, format } = req.body;
    const service = new TestService(caseDir || 'case');

    const startTime = Date.now();
    const results = await service.runAll();
    const duration = Date.now() - startTime;

    const reporter = new Reporter(outputDir || 'reports');
    const report = reporter.generateReport(results);

    // 保存报告
    if (format && format !== 'none') {
      reporter.saveReport(report, format || 'both');
    }

    res.json({
      success: true,
      data: {
        report: {
          total: report.total,
          passed: report.passed,
          failed: report.failed,
          duration: report.duration,
          startTime: report.startTime.toISOString(),
          endTime: report.endTime.toISOString(),
          passRate: report.total > 0 ? ((report.passed / report.total) * 100).toFixed(2) + '%' : '0%'
        },
        results: report.results.map(r => ({
          testCase: {
            id: r.testCase.id,
            title: r.testCase.title,
            module: r.testCase.module,
            priority: r.testCase.priority,
            testType: r.testCase.testType
          },
          success: r.success,
          duration: r.duration,
          startTime: r.startTime.toISOString(),
          endTime: r.endTime.toISOString(),
          error: r.error,
          actionCount: r.actionResults.length,
          passedActions: r.actionResults.filter(ar => ar.result.success).length,
          failedActions: r.actionResults.filter(ar => !ar.result.success).length
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 运行单个测试用例文件
 */
export async function runFile(req: Request, res: Response): Promise<void> {
  try {
    validateEnv();

    const { filePath, outputDir, format } = req.body;

    if (!filePath) {
      res.status(400).json({ error: 'filePath is required' });
      return;
    }

    const service = new TestService();
    const startTime = Date.now();
    const results = await service.runFile(filePath);
    const duration = Date.now() - startTime;

    const reporter = new Reporter(outputDir || 'reports');
    const report = reporter.generateReport(results);

    // 保存报告
    if (format && format !== 'none') {
      reporter.saveReport(report, format || 'both');
    }

    res.json({
      success: true,
      data: {
        report: {
          total: report.total,
          passed: report.passed,
          failed: report.failed,
          duration: report.duration,
          startTime: report.startTime.toISOString(),
          endTime: report.endTime.toISOString(),
          passRate: report.total > 0 ? ((report.passed / report.total) * 100).toFixed(2) + '%' : '0%'
        },
        results: report.results.map(r => ({
          testCase: {
            id: r.testCase.id,
            title: r.testCase.title,
            module: r.testCase.module,
            priority: r.testCase.priority,
            testType: r.testCase.testType
          },
          success: r.success,
          duration: r.duration,
          startTime: r.startTime.toISOString(),
          endTime: r.endTime.toISOString(),
          error: r.error,
          actionResults: r.actionResults.map(ar => ({
            action: {
              type: ar.action.type,
              description: ar.action.description
            },
            success: ar.result.success,
            message: ar.result.message,
            error: ar.result.error,
            timestamp: ar.timestamp.toISOString()
          }))
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 运行单个测试用例
 */
export async function runTestCase(req: Request, res: Response): Promise<void> {
  try {
    validateEnv();

    const { testCase, entryUrl, outputDir, format } = req.body;

    if (!testCase) {
      res.status(400).json({ error: 'testCase is required' });
      return;
    }

    const service = new TestService();
    const startTime = Date.now();
    const result = await service.runTestCase(testCase, entryUrl);
    const duration = Date.now() - startTime;

    // 生成报告
    const reporter = new Reporter(outputDir || 'reports');
    const report = reporter.generateReport([result]);

    // 保存报告
    if (format && format !== 'none') {
      reporter.saveReport(report, format || 'both');
    }

    res.json({
      success: true,
      data: {
        testCase: {
          id: result.testCase.id,
          title: result.testCase.title,
          module: result.testCase.module,
          priority: result.testCase.priority,
          testType: result.testCase.testType
        },
        success: result.success,
        duration: result.duration,
        startTime: result.startTime.toISOString(),
        endTime: result.endTime.toISOString(),
        error: result.error,
        actionResults: result.actionResults.map(ar => ({
          action: {
            type: ar.action.type,
            description: ar.action.description
          },
          success: ar.result.success,
          message: ar.result.message,
          error: ar.result.error,
          timestamp: ar.timestamp.toISOString()
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 运行用例字符串
 */
export async function runString(req: Request, res: Response): Promise<void> {
  try {
    validateEnv();

    const { content, entryUrl, outputDir, format } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const service = new TestService();
    const startTime = Date.now();
    const results = await service.runFromString(content, entryUrl);
    const duration = Date.now() - startTime;

    const reporter = new Reporter(outputDir || 'reports');
    const report = reporter.generateReport(results);

    // 保存报告
    if (format && format !== 'none') {
      reporter.saveReport(report, format || 'both');
    }

    res.json({
      success: true,
      data: {
        report: {
          total: report.total,
          passed: report.passed,
          failed: report.failed,
          duration: report.duration,
          startTime: report.startTime.toISOString(),
          endTime: report.endTime.toISOString(),
          passRate: report.total > 0 ? ((report.passed / report.total) * 100).toFixed(2) + '%' : '0%'
        },
        results: report.results.map(r => ({
          testCase: {
            id: r.testCase.id,
            title: r.testCase.title,
            module: r.testCase.module,
            priority: r.testCase.priority,
            testType: r.testCase.testType
          },
          success: r.success,
          duration: r.duration,
          startTime: r.startTime.toISOString(),
          endTime: r.endTime.toISOString(),
          error: r.error,
          actionCount: r.actionResults.length
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

