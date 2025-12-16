import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { CaseFile } from '../../types/case.js';
import { createLogger } from '../../utils/logger.js';
import { MarkdownCaseParser } from './markdownCaseParser.js';
import { XMindCaseParser } from './xmindCaseParser.js';

const logger = createLogger('CaseParser');

export class CaseParser {
  private caseDir: string;
  private markdownParser: MarkdownCaseParser;
  private xmindParser: XMindCaseParser;
  private useAI: boolean;

  constructor(caseDir: string = 'case', useAI: boolean = true) {
    logger.start('constructor', { caseDir, useAI });
    this.caseDir = caseDir;
    this.useAI = useAI;
    this.markdownParser = new MarkdownCaseParser(useAI);
    this.xmindParser = new XMindCaseParser();
    logger.end('constructor');
  }

  /**
   * 解析用例字符串内容（不依赖文件系统）
   */
  async parseFileContent(content: string, virtualFilePath: string = 'inline-case.md'): Promise<CaseFile> {
    const startTime = Date.now();
    logger.start('parseFileContent', { virtualFilePath, contentLength: content.length });

    try {
      // 字符串内容默认作为 Markdown 处理
      const result = await this.markdownParser.parseFile(virtualFilePath, content);
      const duration = Date.now() - startTime;
      logger.info('Content parsed successfully', {
        virtualFilePath,
        testCaseCount: result.testCases.length,
        duration: `${duration}ms`
      });
      logger.end('parseFileContent', { testCaseCount: result.testCases.length }, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to parse content', error, { virtualFilePath, duration: `${duration}ms` });
      logger.end('parseFileContent', { success: false }, duration);
      throw error;
    }
  }

  /**
   * 解析单个测试用例文件
   */
  async parseFile(filePath: string): Promise<CaseFile> {
    const startTime = Date.now();
    logger.start('parseFile', { filePath });

    try {
      // 检查文件扩展名，选择对应的解析器
      if (filePath.toLowerCase().endsWith('.xmind')) {
        logger.info('Detected XMind file, using XMind parser', { filePath });
        const result = await this.xmindParser.parseFile(filePath);
        const duration = Date.now() - startTime;
        logger.info('XMind file parsed successfully', {
          filePath,
          testCaseCount: result.testCases.length,
          duration: `${duration}ms`
        });
        logger.end('parseFile', { testCaseCount: result.testCases.length }, duration);
        return result;
      }

      // 默认作为 Markdown 文件处理
      const content = readFileSync(filePath, 'utf-8');
      logger.debug('File read successfully', {
        filePath,
        contentLength: content.length
      });

      const result = await this.markdownParser.parseFile(filePath, content);
      const duration = Date.now() - startTime;
      logger.info('File parsed successfully', {
        filePath,
        testCaseCount: result.testCases.length,
        duration: `${duration}ms`
      });
      logger.end('parseFile', { testCaseCount: result.testCases.length }, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to parse file', error, { filePath, duration: `${duration}ms` });
      logger.end('parseFile', { success: false }, duration);
      throw error;
    }
  }

  /**
   * 解析目录下所有测试用例文件
   */
  async parseDirectory(dirPath?: string): Promise<CaseFile[]> {
    const startTime = Date.now();
    const targetDir = dirPath || this.caseDir;
    logger.start('parseDirectory', { targetDir });

    // 支持 .md 和 .xmind 文件
    const files = readdirSync(targetDir).filter(file =>
      file.endsWith('.md') || file.toLowerCase().endsWith('.xmind')
    );
    logger.info('Found case files', {
      targetDir,
      fileCount: files.length,
      files: files
    });

    const results: CaseFile[] = [];
    for (const file of files) {
      const filePath = join(targetDir, file);
      try {
        logger.debug('Parsing file', { filePath });
        const caseFile = await this.parseFile(filePath);
        results.push(caseFile);
        logger.debug('File parsed successfully', {
          filePath,
          testCaseCount: caseFile.testCases.length
        });
      } catch (error) {
        logger.error(`Failed to parse ${filePath}`, error);
      }
    }

    const duration = Date.now() - startTime;
    const totalTestCases = results.reduce((sum, cf) => sum + cf.testCases.length, 0);
    logger.info('Directory parsing completed', {
      targetDir,
      fileCount: results.length,
      totalTestCases,
      duration: `${duration}ms`
    });

    logger.end('parseDirectory', {
      fileCount: results.length,
      totalTestCases
    }, duration);

    return results;
  }
}
