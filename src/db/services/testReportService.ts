import { query, queryOne, transaction } from '../config.js';
import { TestReport, TestResult, ActionResult, ExpectedResultCheck } from '../../types/result.js';
import { formatDateTimeForFilename } from '../../utils/date.js';

export class TestReportService {
  /**
   * 创建测试报告
   */
  async createTestReport(report: TestReport): Promise<string> {
    const reportId = `report-${formatDateTimeForFilename()}`;

    return await transaction(async (client) => {
      // 1. 创建报告主记录
      const reportResult = await client.query<{ id: string }>(
        `INSERT INTO test_reports (
          report_id, total, passed, failed, duration, start_time, end_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          reportId,
          report.total,
          report.passed,
          report.failed,
          report.duration,
          report.startTime,
          report.endTime,
        ]
      );

      const reportDbId = reportResult.rows[0].id;

      // 2. 创建报告摘要
      if (report.summary) {
        await client.query(
          `INSERT INTO test_report_summaries (
            report_id, total_actions, passed_actions, failed_actions,
            total_expected_results, matched_expected_results, unmatched_expected_results
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            reportDbId,
            report.summary.totalActions,
            report.summary.passedActions,
            report.summary.failedActions,
            report.summary.totalExpectedResults,
            report.summary.matchedExpectedResults,
            report.summary.unmatchedExpectedResults,
          ]
        );
      }

      // 3. 创建测试结果
      for (const result of report.results) {
        // 获取或创建测试用例
        let testCase = await client.query<{ id: string }>(
          'SELECT id FROM test_cases WHERE case_id = $1',
          [result.testCase.id]
        );

        let testCaseId: string;

        if (testCase.rows.length === 0) {
          // 测试用例不存在，自动创建
          const insertResult = await client.query<{ id: string }>(
            `INSERT INTO test_cases (
              case_id, title, module, priority, test_type, entry_url,
              preconditions, steps, expected_results
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id`,
            [
              result.testCase.id,
              result.testCase.title,
              result.testCase.module,
              result.testCase.priority,
              result.testCase.testType,
              result.testCase.entryUrl || null,
              JSON.stringify(result.testCase.preconditions || []),
              JSON.stringify(result.testCase.steps || []),
              JSON.stringify(result.testCase.expectedResults || []),
            ]
          );
          testCaseId = insertResult.rows[0].id;
        } else {
          testCaseId = testCase.rows[0].id;
        }

        // 创建测试结果
        const resultRow = await client.query<{ id: string }>(
          `INSERT INTO test_results (
            report_id, test_case_id, success, start_time, end_time, duration, error
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id`,
          [
            reportDbId,
            testCaseId,
            result.success,
            result.startTime,
            result.endTime,
            result.duration,
            result.error || null,
          ]
        );

        const resultId = resultRow.rows[0].id;

        // 创建测试结果摘要
        if (result.summary) {
          await client.query(
            `INSERT INTO test_result_summaries (
              result_id, total_actions, passed_actions, failed_actions,
              total_expected_results, matched_expected_results, unmatched_expected_results
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              resultId,
              result.summary.totalActions,
              result.summary.passedActions,
              result.summary.failedActions,
              result.summary.totalExpectedResults,
              result.summary.matchedExpectedResults,
              result.summary.unmatchedExpectedResults,
            ]
          );
        }

        // 创建操作结果
        for (const ar of result.actionResults) {
          await client.query(
            `INSERT INTO action_results (
              result_id, action_type, description, selector, url, text, timeout, expected,
              success, message, error, screenshot, timestamp, duration
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              resultId,
              ar.action.type,
              ar.action.description,
              ar.action.selector || null,
              ar.action.url || null,
              ar.action.text || null,
              ar.action.timeout || null,
              ar.action.expected || null,
              ar.result.success,
              ar.result.message || null,
              ar.result.error || null,
              ar.result.screenshot || null,
              ar.timestamp,
              ar.duration || null,
            ]
          );
        }

        // 创建预期结果检查
        if (result.expectedResultsCheck) {
          for (const check of result.expectedResultsCheck) {
            await client.query(
              `INSERT INTO expected_result_checks (
                result_id, expected, actual, matched, match_type
              ) VALUES ($1, $2, $3, $4, $5)`,
              [
                resultId,
                check.expected,
                check.actual,
                check.matched,
                check.matchType,
              ]
            );
          }
        }
      }

      return reportId;
    });
  }

  /**
   * 根据 reportId 获取测试报告
   */
  async getTestReportByReportId(reportId: string): Promise<TestReport | null> {
    const report = await queryOne<{
      id: string;
      report_id: string;
      total: number;
      passed: number;
      failed: number;
      duration: number;
      start_time: Date;
      end_time: Date;
    }>('SELECT * FROM test_reports WHERE report_id = $1', [reportId]);

    if (!report) {
      return null;
    }

    return await this.loadFullReport(report.id);
  }

  /**
   * 根据数据库 UUID 获取测试报告
   */
  async getTestReportById(id: string): Promise<TestReport | null> {
    return await this.loadFullReport(id);
  }

  /**
   * 获取所有测试报告列表
   */
  async getAllTestReports(limit?: number, offset?: number): Promise<Array<{
    id: string;
    reportId: string;
    createdAt: Date;
    updatedAt: Date;
    total: number;
    passed: number;
    failed: number;
  }>> {
    let sql = 'SELECT id, report_id as "reportId", created_at as "createdAt", updated_at as "updatedAt", total, passed, failed FROM test_reports ORDER BY created_at DESC';
    const params: any[] = [];

    if (limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(limit);
    }

    if (offset) {
      sql += ` OFFSET $${params.length + 1}`;
      params.push(offset);
    }

    const reports = await query<{
      id: string;
      reportId: string;
      createdAt: Date;
      updatedAt: Date;
      total: number;
      passed: number;
      failed: number;
    }>(sql, params);

    return reports;
  }

  /**
   * 删除测试报告
   */
  async deleteTestReport(reportId: string): Promise<void> {
    await query('DELETE FROM test_reports WHERE report_id = $1', [reportId]);
  }

  /**
   * 加载完整的测试报告
   */
  private async loadFullReport(reportDbId: string): Promise<TestReport | null> {
    // 获取报告基本信息
    const report = await queryOne<{
      id: string;
      report_id: string;
      total: number;
      passed: number;
      failed: number;
      duration: number;
      start_time: Date;
      end_time: Date;
    }>('SELECT * FROM test_reports WHERE id = $1', [reportDbId]);

    if (!report) {
      return null;
    }

    // 获取报告摘要
    const summary = await queryOne<{
      total_actions: number;
      passed_actions: number;
      failed_actions: number;
      total_expected_results: number;
      matched_expected_results: number;
      unmatched_expected_results: number;
    }>('SELECT * FROM test_report_summaries WHERE report_id = $1', [reportDbId]);

    // 获取测试结果
    const results = await query<{
      id: string;
      test_case_id: string;
      success: boolean;
      start_time: Date;
      end_time: Date;
      duration: number;
      error: string | null;
    }>('SELECT * FROM test_results WHERE report_id = $1 ORDER BY created_at ASC', [reportDbId]);

    const testResults: TestResult[] = [];

    for (const result of results) {
      // 获取测试用例
      const testCase = await queryOne<{
        case_id: string;
        title: string;
        module: string;
        priority: string;
        test_type: string;
        entry_url: string | null;
        preconditions: string[] | string;
        steps: string[] | string;
        expected_results: string[] | string;
      }>('SELECT * FROM test_cases WHERE id = $1', [result.test_case_id]);

      if (!testCase) {
        continue;
      }

      // 获取结果摘要
      const resultSummary = await queryOne<{
        total_actions: number;
        passed_actions: number;
        failed_actions: number;
        total_expected_results: number;
        matched_expected_results: number;
        unmatched_expected_results: number;
      }>('SELECT * FROM test_result_summaries WHERE result_id = $1', [result.id]);

      // 获取操作结果
      const actionResults = await query<{
        action_type: string;
        description: string;
        selector: string | null;
        url: string | null;
        text: string | null;
        timeout: number | null;
        expected: string | null;
        success: boolean;
        message: string | null;
        error: string | null;
        screenshot: string | null;
        timestamp: Date;
        duration: number | null;
      }>('SELECT * FROM action_results WHERE result_id = $1 ORDER BY timestamp ASC', [result.id]);

      // 获取预期结果检查
      const expectedChecks = await query<{
        expected: string;
        actual: string;
        matched: boolean;
        match_type: string;
      }>('SELECT * FROM expected_result_checks WHERE result_id = $1', [result.id]);

      testResults.push({
        testCase: {
          id: testCase.case_id,
          title: testCase.title,
          module: testCase.module,
          priority: testCase.priority,
          testType: testCase.test_type,
          entryUrl: testCase.entry_url || undefined,
          preconditions: Array.isArray(testCase.preconditions)
            ? testCase.preconditions
            : JSON.parse(testCase.preconditions || '[]'),
          steps: Array.isArray(testCase.steps)
            ? testCase.steps
            : JSON.parse(testCase.steps || '[]'),
          expectedResults: Array.isArray(testCase.expected_results)
            ? testCase.expected_results
            : JSON.parse(testCase.expected_results || '[]'),
        },
        success: result.success,
        startTime: result.start_time,
        endTime: result.end_time,
        duration: result.duration,
        error: result.error || undefined,
        actionResults: actionResults.map(ar => ({
          action: {
            type: ar.action_type,
            description: ar.description,
            selector: ar.selector || undefined,
            url: ar.url || undefined,
            text: ar.text || undefined,
            timeout: ar.timeout || undefined,
            expected: ar.expected || undefined,
          },
          result: {
            success: ar.success,
            message: ar.message || '',
            error: ar.error || undefined,
            screenshot: ar.screenshot || undefined,
          },
          timestamp: ar.timestamp,
          duration: ar.duration || undefined,
        })),
        expectedResultsCheck: expectedChecks.map(check => ({
          expected: check.expected,
          actual: check.actual,
          matched: check.matched,
          matchType: check.match_type as 'exact' | 'partial' | 'contains' | 'not_matched',
        })),
        summary: resultSummary ? {
          totalActions: resultSummary.total_actions,
          passedActions: resultSummary.passed_actions,
          failedActions: resultSummary.failed_actions,
          totalExpectedResults: resultSummary.total_expected_results,
          matchedExpectedResults: resultSummary.matched_expected_results,
          unmatchedExpectedResults: resultSummary.unmatched_expected_results,
        } : undefined,
      });
    }

    return {
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      duration: report.duration,
      startTime: report.start_time,
      endTime: report.end_time,
      summary: summary ? {
        totalActions: summary.total_actions,
        passedActions: summary.passed_actions,
        failedActions: summary.failed_actions,
        totalExpectedResults: summary.total_expected_results,
        matchedExpectedResults: summary.matched_expected_results,
        unmatchedExpectedResults: summary.unmatched_expected_results,
      } : undefined,
      results: testResults,
    };
  }

  /**
   * 根据用例集执行记录生成测试报告
   */
  async getTestReportByExecutionId(executionId: string): Promise<{
    execution: any;
    suite: any;
    report: TestReport | null;
    evaluation: {
      overall: 'excellent' | 'good' | 'fair' | 'poor';
      passRate: number;
      actionPassRate: number;
      expectedResultMatchRate: number;
      averageDuration: number;
      recommendations: string[];
    };
  } | null> {
    const { testSuiteService } = await import('./testSuiteService.js');
    const { testCaseService } = await import('./testCaseService.js');

    // 获取执行记录
    const execution = await testSuiteService.getExecution(executionId);
    if (!execution) {
      return null;
    }

    // 获取用例集信息
    const suite = await testSuiteService.getTestSuite(execution.suiteId);
    if (!suite) {
      return null;
    }

    // 加载所有测试结果
    const testResults: TestResult[] = [];
    if (execution.results) {
      for (const result of execution.results) {
        if (result.testResultId) {
          // 通过 test_result_id 查找对应的测试结果
          const testResultRow = await queryOne<{
            id: string;
            report_id: string;
            test_case_id: string;
            success: boolean;
            start_time: Date;
            end_time: Date;
            duration: number;
            error: string | null;
          }>('SELECT * FROM test_results WHERE id = $1', [result.testResultId]);

          if (testResultRow) {
            // 获取报告ID
            const reportRow = await queryOne<{ report_id: string }>(
              'SELECT report_id FROM test_reports WHERE id = $1',
              [testResultRow.report_id]
            );

            if (reportRow) {
              // 获取完整的测试报告
              const fullReport = await this.getTestReportByReportId(reportRow.report_id);
              if (fullReport && fullReport.results) {
                // 找到对应的测试结果
                const matchingResult = fullReport.results.find(
                  r => r.testCase.id === result.testCaseId
                );
                if (matchingResult) {
                  testResults.push(matchingResult);
                }
              }
            }
          }
        } else {
          // 如果没有测试结果，创建一个失败的结果
          const testCase = await testCaseService.getTestCaseById(result.testCaseId);
          if (testCase) {
            testResults.push({
              testCase,
              success: result.status === 'success',
              startTime: result.startTime || new Date(),
              endTime: result.endTime || new Date(),
              duration: result.duration || 0,
              error: result.error,
              actionResults: [],
              expectedResultsCheck: [],
            });
          }
        }
      }
    }

    // 生成测试报告
    const report: TestReport = {
      total: execution.totalCases,
      passed: execution.passedCases,
      failed: execution.failedCases,
      duration: execution.duration || 0,
      startTime: execution.startTime || new Date(),
      endTime: execution.endTime || new Date(),
      results: testResults,
    };

    // 计算摘要
    const totalActions = testResults.reduce((sum, r) => sum + (r.summary?.totalActions || 0), 0);
    const passedActions = testResults.reduce((sum, r) => sum + (r.summary?.passedActions || 0), 0);
    const failedActions = testResults.reduce((sum, r) => sum + (r.summary?.failedActions || 0), 0);
    const totalExpectedResults = testResults.reduce(
      (sum, r) => sum + (r.summary?.totalExpectedResults || 0),
      0
    );
    const matchedExpectedResults = testResults.reduce(
      (sum, r) => sum + (r.summary?.matchedExpectedResults || 0),
      0
    );

    report.summary = {
      totalActions,
      passedActions,
      failedActions,
      totalExpectedResults,
      matchedExpectedResults,
      unmatchedExpectedResults: totalExpectedResults - matchedExpectedResults,
    };

    // 生成综合评价
    const passRate = report.total > 0 ? (report.passed / report.total) * 100 : 0;
    const actionPassRate =
      totalActions > 0 ? (passedActions / totalActions) * 100 : 0;
    const expectedResultMatchRate =
      totalExpectedResults > 0 ? (matchedExpectedResults / totalExpectedResults) * 100 : 0;
    const averageDuration =
      testResults.length > 0
        ? testResults.reduce((sum, r) => sum + r.duration, 0) / testResults.length
        : 0;

    // 确定整体评价等级
    let overall: 'excellent' | 'good' | 'fair' | 'poor';
    if (passRate >= 95 && actionPassRate >= 95 && expectedResultMatchRate >= 95) {
      overall = 'excellent';
    } else if (passRate >= 80 && actionPassRate >= 80 && expectedResultMatchRate >= 80) {
      overall = 'good';
    } else if (passRate >= 60 && actionPassRate >= 60 && expectedResultMatchRate >= 60) {
      overall = 'fair';
    } else {
      overall = 'poor';
    }

    // 生成建议
    const recommendations: string[] = [];
    if (passRate < 100) {
      recommendations.push(`有 ${report.failed} 个测试用例失败，建议检查失败用例的具体原因`);
    }
    if (actionPassRate < 100) {
      recommendations.push(`有 ${failedActions} 个操作失败，建议检查操作执行日志`);
    }
    if (expectedResultMatchRate < 100) {
      recommendations.push(
        `有 ${totalExpectedResults - matchedExpectedResults} 个预期结果未匹配，建议检查预期结果设置`
      );
    }
    if (averageDuration > 30000) {
      recommendations.push(`平均执行时间较长（${(averageDuration / 1000).toFixed(2)}秒），建议优化测试用例`);
    }
    if (recommendations.length === 0) {
      recommendations.push('测试执行情况良好，所有指标均达到预期');
    }

    return {
      execution,
      suite,
      report,
      evaluation: {
        overall,
        passRate,
        actionPassRate,
        expectedResultMatchRate,
        averageDuration,
        recommendations,
      },
    };
  }
}

export const testReportService = new TestReportService();
