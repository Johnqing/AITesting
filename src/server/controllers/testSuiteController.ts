import { Request, Response } from 'express';
import { testSuiteService } from '../../db/services/testSuiteService.js';
import { TestSuite, TestCase } from '../../types/case.js';
import { testCaseService } from '../../db/services/testCaseService.js';

/**
 * 获取所有用例集
 */
export async function getAllTestSuites(req: Request, res: Response): Promise<void> {
  try {
    const suites = await testSuiteService.getAllTestSuites();
    
    // 加载每个用例集的测试用例详情
    const suitesWithCases = await Promise.all(
      suites.map(async (suite) => {
        if (suite.testCases && suite.testCases.length > 0) {
          const cases = await Promise.all(
            suite.testCases.map(async (tc) => {
              const fullCase = await testCaseService.getTestCaseById(tc.id);
              return fullCase || tc;
            })
          );
          return { ...suite, testCases: cases };
        }
        return suite;
      })
    );

    res.json({
      success: true,
      data: suitesWithCases,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '获取用例集失败',
    });
  }
}

/**
 * 根据ID获取用例集
 */
export async function getTestSuiteById(req: Request, res: Response): Promise<void> {
  try {
    const { suiteId } = req.params;
    if (!suiteId) {
      res.status(400).json({
        success: false,
        error: '用例集ID不能为空',
      });
      return;
    }

    const suite = await testSuiteService.getTestSuite(suiteId);
    if (!suite) {
      res.status(404).json({
        success: false,
        error: '用例集不存在',
      });
      return;
    }

    // 加载测试用例详情
    if (suite.testCases && suite.testCases.length > 0) {
      const cases = await Promise.all(
        suite.testCases.map(async (tc) => {
          const fullCase = await testCaseService.getTestCaseById(tc.id);
          return fullCase || tc;
        })
      );
      suite.testCases = cases;
    }

    res.json({
      success: true,
      data: suite,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '获取用例集失败',
    });
  }
}

/**
 * 生成用例集ID
 */
function generateSuiteId(name: string): string {
  // 将名称转换为大写，替换空格和特殊字符为连字符
  const nameCode = name
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .substring(0, 20); // 限制长度
  
  // 生成时间戳后4位作为序号
  const sequence = Date.now().toString().slice(-4);
  
  return `SUITE-${nameCode}-${sequence}`;
}

/**
 * 创建或更新用例集
 */
export async function upsertTestSuite(req: Request, res: Response): Promise<void> {
  try {
    const suite: Omit<TestSuite, 'id' | 'createdAt' | 'updatedAt'> = req.body;
    
    if (!suite.name) {
      res.status(400).json({
        success: false,
        error: '用例集名称不能为空',
      });
      return;
    }

    // 如果是新增（没有suiteId）或suiteId为空，自动生成ID
    if (!suite.suiteId) {
      suite.suiteId = generateSuiteId(suite.name);
    }

    const result = await testSuiteService.upsertTestSuite(suite);
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '保存用例集失败',
    });
  }
}

/**
 * 删除用例集
 */
export async function deleteTestSuite(req: Request, res: Response): Promise<void> {
  try {
    const { suiteId } = req.params;
    if (!suiteId) {
      res.status(400).json({
        success: false,
        error: '用例集ID不能为空',
      });
      return;
    }

    await testSuiteService.deleteTestSuite(suiteId);
    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '删除用例集失败',
    });
  }
}

/**
 * 执行用例集
 */
export async function executeTestSuite(req: Request, res: Response): Promise<void> {
  try {
    const { suiteId } = req.params;
    if (!suiteId) {
      res.status(400).json({
        success: false,
        error: '用例集ID不能为空',
      });
      return;
    }

    // 创建执行记录
    const executionId = await testSuiteService.createExecution(suiteId);

    // 异步执行测试用例集（不阻塞响应）
    executeTestSuiteAsync(suiteId, executionId).catch((error) => {
      console.error('执行用例集失败:', error);
    });

    res.json({
      success: true,
      data: {
        executionId,
        message: '用例集执行已开始',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '执行用例集失败',
    });
  }
}

/**
 * 异步执行用例集
 */
async function executeTestSuiteAsync(suiteId: string, executionId: string): Promise<void> {
  try {
    const suite = await testSuiteService.getTestSuite(suiteId);
    if (!suite || !suite.testCases) {
      throw new Error('用例集不存在或没有测试用例');
    }

    // 加载完整的测试用例信息
    const fullTestCases = await Promise.all(
      suite.testCases.map(async (tc) => {
        const fullCase = await testCaseService.getTestCaseById(tc.id);
        return fullCase;
      })
    );

    // 过滤掉不存在的测试用例
    const validTestCases = fullTestCases.filter((tc) => tc !== null) as TestCase[];

    if (validTestCases.length === 0) {
      throw new Error('用例集中没有有效的测试用例');
    }

    // 动态导入测试服务（避免循环依赖）
    const { TestService } = await import('../testService.js');

    const testService = new TestService();

    // 依次执行每个测试用例
    for (const testCase of validTestCases) {
      if (!testCase.id) continue;

      try {
        // 更新状态为执行中
        await testSuiteService.updateExecutionResult(
          executionId,
          testCase.id,
          'running'
        );

        // 执行测试用例
        const testResult = await testService.runTestCase(testCase, testCase.entryUrl);

        // 保存测试结果到数据库，获取报告ID
        const { testReportService } = await import('../../db/index.js');
        const { Reporter } = await import('../../reporter/reporter.js');
        const reporter = new Reporter();
        const report = reporter.generateReport([testResult]);
        const reportId = await testReportService.createTestReport(report);

        // 查询对应的 test_result UUID ID（test_suite_execution_results 需要的是 test_results.id，不是 report_id）
        const { queryOne } = await import('../../db/config.js');
        const testResultRow = await queryOne<{ id: string }>(
          `SELECT tr.id 
           FROM test_results tr
           JOIN test_reports trp ON tr.report_id = trp.id
           JOIN test_cases tc ON tr.test_case_id = tc.id
           WHERE trp.report_id = $1 AND tc.case_id = $2
           LIMIT 1`,
          [reportId, testCase.id]
        );

        // 更新执行结果
        await testSuiteService.updateExecutionResult(
          executionId,
          testCase.id,
          testResult.success ? 'success' : 'failed',
          testResultRow?.id,
          testResult.error
        );
      } catch (error: any) {
        // 更新为失败状态
        await testSuiteService.updateExecutionResult(
          executionId,
          testCase.id,
          'failed',
          undefined,
          error.message || '执行失败'
        );
      }
    }
  } catch (error) {
    console.error('执行用例集异常:', error);
    throw error;
  }
}

/**
 * 获取执行记录
 */
export async function getExecution(req: Request, res: Response): Promise<void> {
  try {
    const { executionId } = req.params;
    if (!executionId) {
      res.status(400).json({
        success: false,
        error: '执行ID不能为空',
      });
      return;
    }

    const execution = await testSuiteService.getExecution(executionId);
    if (!execution) {
      res.status(404).json({
        success: false,
        error: '执行记录不存在',
      });
      return;
    }

    // 加载测试结果详情
    if (execution.results) {
      const { testReportService } = await import('../../db/index.js');

      for (const result of execution.results) {
        if (result.testResultId) {
          try {
            const report = await testReportService.getTestReportByReportId(result.testResultId);
            if (report && report.results) {
              const testResult = report.results.find((r: any) => r.testCase.id === result.testCaseId);
              if (testResult) {
                result.testResult = testResult;
              }
            }
          } catch (error) {
            console.error('加载测试结果失败:', error);
          }
        }
      }
    }

    res.json({
      success: true,
      data: execution,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '获取执行记录失败',
    });
  }
}

/**
 * 获取用例集的所有执行记录
 */
export async function getSuiteExecutions(req: Request, res: Response): Promise<void> {
  try {
    const { suiteId } = req.params;
    if (!suiteId) {
      res.status(400).json({
        success: false,
        error: '用例集ID不能为空',
      });
      return;
    }

    const executions = await testSuiteService.getSuiteExecutions(suiteId);
    res.json({
      success: true,
      data: executions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '获取执行记录失败',
    });
  }
}

