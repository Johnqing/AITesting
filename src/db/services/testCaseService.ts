import { query, queryOne, transaction } from '../config.js';
import { TestCase } from '../../types/case.js';

export class TestCaseService {
    /**
     * 创建或更新测试用例
     */
    async upsertTestCase(testCase: TestCase, filePath?: string): Promise<TestCase> {
        const result = await queryOne<{
            id: string;
            case_id: string;
            title: string;
            module: string;
            priority: string;
            test_type: string;
            entry_url: string | null;
            file_path: string | null;
            system: string | null;
            test_objective: string | null;
            preconditions: string[];
            steps: string[];
            expected_results: string[];
        }>(
            `INSERT INTO test_cases (
        case_id, title, module, priority, test_type, entry_url, file_path,
        system, test_objective, preconditions, steps, expected_results
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (case_id) DO UPDATE SET
        title = EXCLUDED.title,
        module = EXCLUDED.module,
        priority = EXCLUDED.priority,
        test_type = EXCLUDED.test_type,
        entry_url = EXCLUDED.entry_url,
        file_path = EXCLUDED.file_path,
        system = EXCLUDED.system,
        test_objective = EXCLUDED.test_objective,
        preconditions = EXCLUDED.preconditions,
        steps = EXCLUDED.steps,
        expected_results = EXCLUDED.expected_results,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
            [
                testCase.id,
                testCase.title,
                testCase.module,
                testCase.priority,
                testCase.testType,
                testCase.entryUrl || null,
                filePath || null,
                testCase.system || null,
                testCase.testObjective || null,
                JSON.stringify(testCase.preconditions),
                JSON.stringify(testCase.steps),
                JSON.stringify(testCase.expectedResults),
            ]
        );

        if (!result) {
            throw new Error('Failed to upsert test case');
        }

        return this.toTestCase(result);
    }

    /**
     * 批量创建或更新测试用例
     */
    async upsertTestCases(testCases: TestCase[], filePath?: string): Promise<TestCase[]> {
        return await transaction(async (client) => {
            const results: TestCase[] = [];
            for (const testCase of testCases) {
                const result = await client.query<{
                    id: string;
                    case_id: string;
                    title: string;
                    module: string;
                    priority: string;
                    test_type: string;
                    entry_url: string | null;
                    file_path: string | null;
                    preconditions: string[];
                    steps: string[];
                    expected_results: string[];
                }>(
                    `INSERT INTO test_cases (
            case_id, title, module, priority, test_type, entry_url, file_path,
            system, test_objective, preconditions, steps, expected_results
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (case_id) DO UPDATE SET
            title = EXCLUDED.title,
            module = EXCLUDED.module,
            priority = EXCLUDED.priority,
            test_type = EXCLUDED.test_type,
            entry_url = EXCLUDED.entry_url,
            file_path = EXCLUDED.file_path,
            system = EXCLUDED.system,
            test_objective = EXCLUDED.test_objective,
            preconditions = EXCLUDED.preconditions,
            steps = EXCLUDED.steps,
            expected_results = EXCLUDED.expected_results,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *`,
                    [
                        testCase.id,
                        testCase.title,
                        testCase.module,
                        testCase.priority,
                        testCase.testType,
                        testCase.entryUrl || null,
                        filePath || null,
                        testCase.system || null,
                        testCase.testObjective || null,
                        JSON.stringify(testCase.preconditions),
                        JSON.stringify(testCase.steps),
                        JSON.stringify(testCase.expectedResults),
                    ]
                );
                if (result.rows[0]) {
                    results.push(this.toTestCase(result.rows[0]));
                }
            }
            return results;
        });
    }

    /**
     * 根据 ID 获取测试用例
     */
    async getTestCaseById(caseId: string): Promise<TestCase | null> {
        const result = await queryOne<{
            id: string;
            case_id: string;
            title: string;
            module: string;
            priority: string;
            test_type: string;
            entry_url: string | null;
            file_path: string | null;
            system: string | null;
            test_objective: string | null;
            preconditions: string[];
            steps: string[];
            expected_results: string[];
        }>('SELECT * FROM test_cases WHERE case_id = $1', [caseId]);

        return result ? this.toTestCase(result) : null;
    }

    /**
     * 根据数据库 UUID 获取测试用例
     */
    async getTestCaseByUuid(id: string): Promise<TestCase | null> {
        const result = await queryOne<{
            id: string;
            case_id: string;
            title: string;
            module: string;
            priority: string;
            test_type: string;
            entry_url: string | null;
            file_path: string | null;
            system: string | null;
            test_objective: string | null;
            preconditions: string[];
            steps: string[];
            expected_results: string[];
        }>('SELECT * FROM test_cases WHERE id = $1', [id]);

        return result ? this.toTestCase(result) : null;
    }

    /**
     * 获取所有测试用例
     */
    async getAllTestCases(): Promise<TestCase[]> {
        const results = await query<{
            id: string;
            case_id: string;
            title: string;
            module: string;
            priority: string;
            test_type: string;
            entry_url: string | null;
            file_path: string | null;
            system: string | null;
            test_objective: string | null;
            preconditions: string[];
            steps: string[];
            expected_results: string[];
        }>('SELECT * FROM test_cases ORDER BY created_at DESC');

        return results.map(r => this.toTestCase(r));
    }

    /**
     * 根据模块获取测试用例
     */
    async getTestCasesByModule(module: string): Promise<TestCase[]> {
        const results = await query<{
            id: string;
            case_id: string;
            title: string;
            module: string;
            priority: string;
            test_type: string;
            entry_url: string | null;
            file_path: string | null;
            system: string | null;
            test_objective: string | null;
            preconditions: string[];
            steps: string[];
            expected_results: string[];
        }>('SELECT * FROM test_cases WHERE module = $1 ORDER BY created_at DESC', [module]);

        return results.map(r => this.toTestCase(r));
    }

    /**
     * 删除测试用例
     */
    async deleteTestCase(caseId: string): Promise<void> {
        await query('DELETE FROM test_cases WHERE case_id = $1', [caseId]);
    }

    /**
     * 转换为 TestCase 类型
     */
    private toTestCase(result: {
        case_id: string;
        title: string;
        module: string;
        priority: string;
        test_type: string;
        entry_url: string | null;
        system?: string | null;
        test_objective?: string | null;
        preconditions: string[] | string;
        steps: string[] | string;
        expected_results: string[] | string;
    }): TestCase {
        return {
            id: result.case_id,
            title: result.title,
            module: result.module,
            priority: result.priority,
            testType: result.test_type,
            entryUrl: result.entry_url || undefined,
            system: result.system || undefined,
            testObjective: result.test_objective || undefined,
            preconditions: Array.isArray(result.preconditions)
                ? result.preconditions
                : JSON.parse(result.preconditions || '[]'),
            steps: Array.isArray(result.steps)
                ? result.steps
                : JSON.parse(result.steps || '[]'),
            expectedResults: Array.isArray(result.expected_results)
                ? result.expected_results
                : JSON.parse(result.expected_results || '[]'),
        };
    }
}

export const testCaseService = new TestCaseService();
