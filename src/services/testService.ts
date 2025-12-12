import { TestRunner } from '../core/runner/testRunner.js';
import { CaseParser } from '../core/parser/caseParser.js';
import { TestResult } from '../types/result.js';
import { TestCase, CaseFile } from '../types/case.js';
import { PlaywrightMCPClient } from '../adapters/mcp/playwrightClient.js';

/**
 * 测试服务层
 * 封装测试运行的核心逻辑，方便后续扩展其他能力
 */
export class TestService {
  private runner: TestRunner;
  private parser: CaseParser;
  private playwrightClient: PlaywrightMCPClient;

  constructor(caseDir: string = 'case') {
    this.parser = new CaseParser(caseDir);
    this.runner = new TestRunner();
    this.runner.setCaseParser(this.parser);
    this.playwrightClient = new PlaywrightMCPClient();
  }

  /**
   * 运行所有测试用例
   */
  async runAll(): Promise<TestResult[]> {
    await this.playwrightClient.connect();
    try {
      return await this.runner.runAll();
    } finally {
      await this.playwrightClient.disconnect();
    }
  }

  /**
   * 运行单个测试用例文件
   */
  async runFile(filePath: string): Promise<TestResult[]> {
    await this.playwrightClient.connect();
    try {
      return await this.runner.runFile(filePath);
    } finally {
      await this.playwrightClient.disconnect();
    }
  }

  /**
   * 运行单个测试用例
   */
  async runTestCase(testCase: TestCase, entryUrl?: string): Promise<TestResult> {
    await this.playwrightClient.connect();
    try {
      return await this.runner.runTestCase(testCase, entryUrl);
    } finally {
      await this.playwrightClient.disconnect();
    }
  }

  /**
   * 解析用例字符串并运行
   */
  async runFromString(caseContent: string, entryUrl?: string): Promise<TestResult[]> {
    // 创建临时解析器（不依赖目录）
    const parser = new CaseParser('', true);
    
    // 解析用例字符串
    const caseFile = await parser.parseFileContent(caseContent, 'inline-case.md');
    
    await this.playwrightClient.connect();
    try {
      const results: TestResult[] = [];
      
      // 运行所有用例
      for (const testCase of caseFile.testCases) {
        const result = await this.runner.runTestCase(
          testCase,
          entryUrl || caseFile.entryUrl
        );
        results.push(result);
      }
      
      return results;
    } finally {
      await this.playwrightClient.disconnect();
    }
  }

  /**
   * 解析目录下所有测试用例文件
   */
  async parseDirectory(dirPath?: string): Promise<CaseFile[]> {
    return await this.parser.parseDirectory(dirPath);
  }

  /**
   * 解析单个测试用例文件
   */
  async parseFile(filePath: string): Promise<CaseFile> {
    return await this.parser.parseFile(filePath);
  }
}

