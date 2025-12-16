import { query, queryOne, transaction } from '../config.js';
import { PRDParser, PRDDocument } from '../../core/parser/prdParser.js';
import { TestCase } from '../../types/case.js';
import { testCaseService } from './testCaseService.js';

export interface PRDRecord {
  id: string;
  prdId: string;
  title: string;
  description: string | null;
  content: string;
  version: string;
  status: string;
  author: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PRDService {
  private parser: PRDParser;

  constructor() {
    this.parser = new PRDParser();
  }

  /**
   * 创建或更新 PRD
   */
  async upsertPRD(prd: PRDDocument): Promise<PRDRecord> {
    const prdId = prd.prdId || `PRD-${Date.now()}`;

    const result = await queryOne<any>(
      `INSERT INTO prds (
        prd_id, title, description, content, version, status, author
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (prd_id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        content = EXCLUDED.content,
        version = EXCLUDED.version,
        status = EXCLUDED.status,
        author = EXCLUDED.author,
        updated_at = CURRENT_TIMESTAMP
      RETURNING 
        id,
        prd_id as "prdId",
        title,
        description,
        content,
        version,
        status,
        author,
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        prdId,
        prd.title,
        prd.description || null,
        prd.content,
        prd.version || '1.0.0',
        prd.status || 'draft',
        prd.author || null,
      ]
    );

    if (!result) {
      throw new Error('Failed to upsert PRD');
    }

    // 确保 prdId 存在
    if (!result.prdId) {
      console.error('Warning: prdId is missing in result', result);
      result.prdId = prdId;
    }

    return result as PRDRecord;
  }

  /**
   * 根据 ID 获取 PRD
   */
  async getPRDById(prdId: string): Promise<PRDRecord | null> {
    if (!prdId || prdId.trim() === '') {
      return null;
    }
    
    const result = await queryOne<any>(
      `SELECT 
        id,
        prd_id as "prdId",
        title,
        description,
        content,
        version,
        status,
        author,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM prds WHERE prd_id = $1`,
      [prdId]
    );

    return (result as PRDRecord) || null;
  }

  /**
   * 根据数据库 UUID 获取 PRD
   */
  async getPRDByUuid(id: string): Promise<PRDRecord | null> {
    const result = await queryOne<any>(
      `SELECT 
        id,
        prd_id as "prdId",
        title,
        description,
        content,
        version,
        status,
        author,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM prds WHERE id = $1`,
      [id]
    );

    return (result as PRDRecord) || null;
  }

  /**
   * 获取所有 PRD
   */
  async getAllPRDs(): Promise<PRDRecord[]> {
    const results = await query<any>(
      `SELECT 
        id,
        prd_id as "prdId",
        title,
        description,
        content,
        version,
        status,
        author,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM prds ORDER BY created_at DESC`
    );

    return results as PRDRecord[];
  }

  /**
   * 删除 PRD
   */
  async deletePRD(prdId: string): Promise<void> {
    if (!prdId || prdId.trim() === '') {
      throw new Error('PRD ID is required');
    }
    
    await query('DELETE FROM prds WHERE prd_id = $1', [prdId]);
  }

  /**
   * 从 PRD 生成测试用例
   */
  async generateTestCasesFromPRD(prdId: string, saveToDatabase: boolean = true): Promise<TestCase[]> {
    if (!prdId || prdId.trim() === '') {
      throw new Error('PRD ID is required');
    }
    
    const prdRecord = await this.getPRDById(prdId);
    if (!prdRecord) {
      throw new Error(`PRD not found: ${prdId}`);
    }

    const prd: PRDDocument = {
      prdId: prdRecord.prdId,
      title: prdRecord.title,
      description: prdRecord.description || undefined,
      content: prdRecord.content,
      version: prdRecord.version,
      status: prdRecord.status,
      author: prdRecord.author || undefined,
    };

    // 使用 AI 生成测试用例
    const testCases = await this.parser.convertPRDToTestCases(prd);

    if (saveToDatabase) {
      return await transaction(async (client) => {
        const savedTestCases: TestCase[] = [];

        // 获取 PRD 的数据库 ID
        const prdDbId = prdRecord.id;

        for (const testCase of testCases) {
          // 保存到 prd_generated_test_cases 表
          await client.query(
            `INSERT INTO prd_generated_test_cases (
              prd_id, case_id, title, module, priority, test_type, entry_url,
              preconditions, steps, expected_results, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT DO NOTHING`,
            [
              prdDbId,
              testCase.id,
              testCase.title,
              testCase.module,
              testCase.priority,
              testCase.testType,
              testCase.entryUrl || null,
              JSON.stringify(testCase.preconditions),
              JSON.stringify(testCase.steps),
              JSON.stringify(testCase.expectedResults),
              'draft'
            ]
          );

          // 可选：同时保存到 test_cases 表
          try {
            const savedCase = await testCaseService.upsertTestCase(testCase);
            savedTestCases.push(savedCase);

            // 建立关联关系
            await client.query(
              `INSERT INTO prd_test_cases (prd_id, test_case_id)
               VALUES ($1, (SELECT id FROM test_cases WHERE case_id = $2))
               ON CONFLICT DO NOTHING`,
              [prdDbId, testCase.id]
            );
          } catch (error) {
            console.error(`Failed to save test case ${testCase.id}:`, error);
            // 继续处理其他测试用例
          }
        }

        return savedTestCases;
      });
    }

    return testCases;
  }

  /**
   * 获取 PRD 生成的测试用例
   */
  async getGeneratedTestCases(prdId: string): Promise<TestCase[]> {
    if (!prdId || prdId.trim() === '') {
      throw new Error('PRD ID is required');
    }
    
    const prdRecord = await this.getPRDById(prdId);
    if (!prdRecord) {
      throw new Error(`PRD not found: ${prdId}`);
    }

    const results = await query<{
      case_id: string;
      title: string;
      module: string;
      priority: string;
      test_type: string;
      entry_url: string | null;
      preconditions: string[] | string;
      steps: string[] | string;
      expected_results: string[] | string;
      status: string;
    }>(
      `SELECT case_id, title, module, priority, test_type, entry_url,
              preconditions, steps, expected_results, status
       FROM prd_generated_test_cases
       WHERE prd_id = (SELECT id FROM prds WHERE prd_id = $1)
       ORDER BY created_at`,
      [prdId]
    );

    return results.map(r => ({
      id: r.case_id,
      title: r.title,
      module: r.module,
      priority: r.priority,
      testType: r.test_type,
      entryUrl: r.entry_url || undefined,
      preconditions: Array.isArray(r.preconditions)
        ? r.preconditions
        : JSON.parse(r.preconditions || '[]'),
      steps: Array.isArray(r.steps)
        ? r.steps
        : JSON.parse(r.steps || '[]'),
      expectedResults: Array.isArray(r.expected_results)
        ? r.expected_results
        : JSON.parse(r.expected_results || '[]'),
    }));
  }

  /**
   * 从文件解析并保存 PRD
   */
  async parseAndSavePRDFromFile(filePath: string): Promise<PRDRecord> {
    const prd = await this.parser.parseFile(filePath);
    return await this.upsertPRD(prd);
  }

  /**
   * 从内容解析并保存 PRD
   */
  async parseAndSavePRDFromContent(content: string, prdId?: string): Promise<PRDRecord> {
    const prd = await this.parser.parseContent(content);
    if (prdId) {
      prd.prdId = prdId;
    }
    return await this.upsertPRD(prd);
  }
}

export const prdService = new PRDService();

