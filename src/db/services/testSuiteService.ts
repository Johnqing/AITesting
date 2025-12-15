import { query, queryOne, transaction } from '../config.js';
import { TestSuite, TestSuiteExecution, TestSuiteExecutionResult } from '../../types/case.js';
import { formatDateTimeForFilename } from '../../utils/date.js';

export class TestSuiteService {
  /**
   * 创建或更新测试用例集
   */
  async upsertTestSuite(suite: Omit<TestSuite, 'id' | 'createdAt' | 'updatedAt'>): Promise<TestSuite> {
    const suiteId = suite.suiteId || `SUITE-${Date.now()}`;

    return await transaction(async (client) => {
      // 创建或更新用例集
      const suiteResult = await client.query<{
        id: string;
        suite_id: string;
        name: string;
        description: string | null;
        system: string | null;
        created_by: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO test_suites (
          suite_id, name, description, system, created_by
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (suite_id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          system = EXCLUDED.system,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          suiteId,
          suite.name,
          suite.description || null,
          suite.system || null,
          suite.createdBy || null,
        ]
      );

      const suiteDbId = suiteResult.rows[0].id;

      // 如果提供了测试用例列表，更新关联关系
      if (suite.testCases && suite.testCases.length > 0) {
        // 先删除旧的关联
        await client.query('DELETE FROM test_suite_cases WHERE suite_id = $1', [suiteDbId]);

        // 创建新的关联
        for (let i = 0; i < suite.testCases.length; i++) {
          const testCase = suite.testCases[i];
          // 获取测试用例的数据库ID
          const testCaseRow = await client.query<{ id: string }>(
            'SELECT id FROM test_cases WHERE case_id = $1',
            [testCase.id]
          );

          if (testCaseRow.rows.length > 0) {
            await client.query(
              `INSERT INTO test_suite_cases (suite_id, test_case_id, sequence)
               VALUES ($1, $2, $3)
               ON CONFLICT (suite_id, test_case_id) DO UPDATE SET sequence = EXCLUDED.sequence`,
              [suiteDbId, testCaseRow.rows[0].id, i]
            );
          }
        }
      }

      return this.toTestSuite(suiteResult.rows[0]);
    });
  }

  /**
   * 获取测试用例集
   */
  async getTestSuite(suiteId: string): Promise<TestSuite | null> {
    const suite = await queryOne<{
      id: string;
      suite_id: string;
      name: string;
      description: string | null;
      system: string | null;
      created_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>('SELECT * FROM test_suites WHERE suite_id = $1', [suiteId]);

    if (!suite) {
      return null;
    }

    // 加载关联的测试用例
    const testCases = await query<{
      test_case_id: string;
      sequence: number;
    }>(
      `SELECT tc.case_id as test_case_id, tsc.sequence
       FROM test_suite_cases tsc
       JOIN test_cases tc ON tsc.test_case_id = tc.id
       WHERE tsc.suite_id = (SELECT id FROM test_suites WHERE suite_id = $1)
       ORDER BY tsc.sequence`,
      [suiteId]
    );

    return {
      ...this.toTestSuite(suite),
      testCases: testCases.map(tc => ({ id: tc.test_case_id } as any)),
    };
  }

  /**
   * 获取所有测试用例集
   */
  async getAllTestSuites(): Promise<TestSuite[]> {
    const suites = await query<{
      id: string;
      suite_id: string;
      name: string;
      description: string | null;
      system: string | null;
      created_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>('SELECT * FROM test_suites ORDER BY created_at DESC');

    // 加载每个用例集的测试用例
    const suitesWithCases = await Promise.all(
      suites.map(async (s) => {
        const suite = this.toTestSuite(s);
        const testCases = await query<{
          test_case_id: string;
          sequence: number;
        }>(
          `SELECT tc.case_id as test_case_id, tsc.sequence
           FROM test_suite_cases tsc
           JOIN test_cases tc ON tsc.test_case_id = tc.id
           WHERE tsc.suite_id = $1
           ORDER BY tsc.sequence`,
          [s.id]
        );
        return {
          ...suite,
          testCases: testCases.map(tc => ({ id: tc.test_case_id } as any)),
        };
      })
    );

    return suitesWithCases;
  }

  /**
   * 删除测试用例集
   */
  async deleteTestSuite(suiteId: string): Promise<void> {
    await query('DELETE FROM test_suites WHERE suite_id = $1', [suiteId]);
  }

  /**
   * 创建用例集执行记录
   */
  async createExecution(suiteId: string, createdBy?: string): Promise<string> {
    const executionId = `exec-${formatDateTimeForFilename()}`;

    return await transaction(async (client) => {
      // 获取用例集ID
      const suite = await client.query<{ id: string }>(
        'SELECT id FROM test_suites WHERE suite_id = $1',
        [suiteId]
      );

      if (suite.rows.length === 0) {
        throw new Error(`Test suite not found: ${suiteId}`);
      }

      const suiteDbId = suite.rows[0].id;

      // 获取用例集中的所有测试用例
      const testCases = await client.query<{ test_case_id: string; id: string }>(
        `SELECT tc.id, tc.case_id as test_case_id
         FROM test_suite_cases tsc
         JOIN test_cases tc ON tsc.test_case_id = tc.id
         WHERE tsc.suite_id = $1
         ORDER BY tsc.sequence`,
        [suiteDbId]
      );

      // 创建执行记录
      const executionResult = await client.query<{ id: string }>(
        `INSERT INTO test_suite_executions (
          suite_id, execution_id, status, start_time, total_cases, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          suiteDbId,
          executionId,
          'running',
          new Date(),
          testCases.rows.length,
          createdBy || null,
        ]
      );

      const executionDbId = executionResult.rows[0].id;

      // 创建执行结果记录（每个用例一条）
      for (const testCase of testCases.rows) {
        await client.query(
          `INSERT INTO test_suite_execution_results (
            execution_id, test_case_id, status
          ) VALUES ($1, $2, $3)`,
          [executionDbId, testCase.id, 'pending']
        );
      }

      return executionId;
    });
  }

  /**
   * 更新执行结果状态
   */
  async updateExecutionResult(
    executionId: string,
    testCaseId: string,
    status: 'pending' | 'running' | 'success' | 'failed',
    testResultId?: string,
    error?: string
  ): Promise<void> {
    await transaction(async (client) => {
      // 获取执行记录ID
      const execution = await client.query<{ id: string }>(
        'SELECT id FROM test_suite_executions WHERE execution_id = $1',
        [executionId]
      );

      if (execution.rows.length === 0) {
        throw new Error(`Execution not found: ${executionId}`);
      }

      const executionDbId = execution.rows[0].id;

      // 获取测试用例ID
      const testCase = await client.query<{ id: string }>(
        'SELECT id FROM test_cases WHERE case_id = $1',
        [testCaseId]
      );

      if (testCase.rows.length === 0) {
        throw new Error(`Test case not found: ${testCaseId}`);
      }

      const testCaseDbId = testCase.rows[0].id;

      // 更新执行结果
      const now = new Date();
      
      // 根据状态构建不同的 SQL 和参数
      let updateSql: string;
      let params: any[];
      
      if (status === 'running') {
        updateSql = `UPDATE test_suite_execution_results
         SET status = $1,
             test_result_id = $2,
             error = $3,
             start_time = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE execution_id = $5 AND test_case_id = $6`;
        params = [
          status,
          testResultId || null,
          error || null,
          now,
          executionDbId,
          testCaseDbId,
        ];
      } else if (status === 'success' || status === 'failed') {
        updateSql = `UPDATE test_suite_execution_results
         SET status = $1,
             test_result_id = $2,
             error = $3,
             end_time = $4,
             duration = EXTRACT(EPOCH FROM ($4 - start_time))::INTEGER * 1000,
             updated_at = CURRENT_TIMESTAMP
         WHERE execution_id = $5 AND test_case_id = $6`;
        params = [
          status,
          testResultId || null,
          error || null,
          now,
          executionDbId,
          testCaseDbId,
        ];
      } else {
        // pending 状态
        updateSql = `UPDATE test_suite_execution_results
         SET status = $1,
             test_result_id = $2,
             error = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE execution_id = $4 AND test_case_id = $5`;
        params = [
          status,
          testResultId || null,
          error || null,
          executionDbId,
          testCaseDbId,
        ];
      }
      
      await client.query(updateSql, params);

      // 更新执行记录的统计信息
      if (status === 'success' || status === 'failed') {
        const stats = await client.query<{
          total: number;
          passed: number;
          failed: number;
        }>(
          `SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'success') as passed,
            COUNT(*) FILTER (WHERE status = 'failed') as failed
           FROM test_suite_execution_results
           WHERE execution_id = $1`,
          [executionDbId]
        );

        const allCompleted = await client.query<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM test_suite_execution_results
           WHERE execution_id = $1 AND status IN ('success', 'failed')`,
          [executionDbId]
        );

        const execStatus = allCompleted.rows[0].count === stats.rows[0].total
          ? 'completed'
          : 'running';

        // 根据状态构建不同的 SQL 和参数
        let execUpdateSql: string;
        let execParams: any[];
        
        if (execStatus === 'completed') {
          execUpdateSql = `UPDATE test_suite_executions
           SET status = $1,
               passed_cases = $2,
               failed_cases = $3,
               end_time = $4,
               duration = EXTRACT(EPOCH FROM ($4 - start_time))::INTEGER * 1000,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5`;
          execParams = [
            execStatus,
            stats.rows[0].passed,
            stats.rows[0].failed,
            now,
            executionDbId,
          ];
        } else {
          execUpdateSql = `UPDATE test_suite_executions
           SET status = $1,
               passed_cases = $2,
               failed_cases = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`;
          execParams = [
            execStatus,
            stats.rows[0].passed,
            stats.rows[0].failed,
            executionDbId,
          ];
        }
        
        await client.query(execUpdateSql, execParams);
      }
    });
  }

  /**
   * 获取执行记录
   */
  async getExecution(executionId: string): Promise<TestSuiteExecution | null> {
    const execution = await queryOne<{
      id: string;
      suite_id: string;
      execution_id: string;
      status: string;
      start_time: Date | null;
      end_time: Date | null;
      duration: number | null;
      total_cases: number;
      passed_cases: number;
      failed_cases: number;
      created_by: string | null;
      created_at: Date;
    }>(
      `SELECT 
        e.id,
        s.suite_id,
        e.execution_id,
        e.status,
        e.start_time,
        e.end_time,
        e.duration,
        e.total_cases,
        e.passed_cases,
        e.failed_cases,
        e.created_by,
        e.created_at
       FROM test_suite_executions e
       JOIN test_suites s ON e.suite_id = s.id
       WHERE e.execution_id = $1`,
      [executionId]
    );

    if (!execution) {
      return null;
    }

    // 加载执行结果
    const results = await query<{
      id: string;
      test_case_id: string;
      test_result_id: string | null;
      status: string;
      start_time: Date | null;
      end_time: Date | null;
      duration: number | null;
      error: string | null;
      case_id: string;
      title: string;
    }>(
      `SELECT 
        er.id,
        tc.case_id as test_case_id,
        er.test_result_id,
        er.status,
        er.start_time,
        er.end_time,
        er.duration,
        er.error,
        tc.case_id,
        tc.title
       FROM test_suite_execution_results er
       JOIN test_cases tc ON er.test_case_id = tc.id
       WHERE er.execution_id = (SELECT id FROM test_suite_executions WHERE execution_id = $1)
       ORDER BY er.created_at`,
      [executionId]
    );

    return {
      id: execution.id,
      suiteId: execution.suite_id,
      executionId: execution.execution_id,
      status: execution.status as any,
      startTime: execution.start_time || undefined,
      endTime: execution.end_time || undefined,
      duration: execution.duration || undefined,
      totalCases: execution.total_cases,
      passedCases: execution.passed_cases,
      failedCases: execution.failed_cases,
      createdBy: execution.created_by || undefined,
      createdAt: execution.created_at,
      results: results.map(r => ({
        id: r.id,
        executionId: execution.execution_id,
        testCaseId: r.test_case_id,
        testResultId: r.test_result_id || undefined,
        status: r.status as any,
        startTime: r.start_time || undefined,
        endTime: r.end_time || undefined,
        duration: r.duration || undefined,
        error: r.error || undefined,
        testCase: {
          id: r.case_id,
          title: r.title,
        } as any,
      })),
    };
  }

  /**
   * 获取用例集的所有执行记录
   */
  async getSuiteExecutions(suiteId: string): Promise<TestSuiteExecution[]> {
    const executions = await query<{
      id: string;
      execution_id: string;
      status: string;
      start_time: Date | null;
      end_time: Date | null;
      duration: number | null;
      total_cases: number;
      passed_cases: number;
      failed_cases: number;
      created_at: Date;
    }>(
      `SELECT 
        e.id,
        e.execution_id,
        e.status,
        e.start_time,
        e.end_time,
        e.duration,
        e.total_cases,
        e.passed_cases,
        e.failed_cases,
        e.created_at
       FROM test_suite_executions e
       JOIN test_suites s ON e.suite_id = s.id
       WHERE s.suite_id = $1
       ORDER BY e.created_at DESC`,
      [suiteId]
    );

    return executions.map(e => ({
      id: e.id,
      suiteId,
      executionId: e.execution_id,
      status: e.status as any,
      startTime: e.start_time || undefined,
      endTime: e.end_time || undefined,
      duration: e.duration || undefined,
      totalCases: e.total_cases,
      passedCases: e.passed_cases,
      failedCases: e.failed_cases,
      createdAt: e.created_at,
    }));
  }

  /**
   * 转换为 TestSuite 类型
   */
  private toTestSuite(result: {
    id: string;
    suite_id: string;
    name: string;
    description: string | null;
    system: string | null;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
  }): TestSuite {
    return {
      id: result.id,
      suiteId: result.suite_id,
      name: result.name,
      description: result.description || undefined,
      system: result.system || undefined,
      createdBy: result.created_by || undefined,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }
}

export const testSuiteService = new TestSuiteService();

