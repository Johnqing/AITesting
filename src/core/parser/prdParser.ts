import matter from 'gray-matter';
import { readFileSync } from 'fs';
import { TestCase } from '../../types/case.js';
import { AIClient } from '../../adapters/ai/aiClient.js';
import { createLogger } from '../../utils/logger.js';
import { PRD_PARSER_SYSTEM_PROMPT, PRD_CHUNK_PARSER_SYSTEM_PROMPT } from '../../prompts/testCase/prdParser.js';

const logger = createLogger('PRDParser');

// 文档分块配置：当文档内容超过此大小时，将进行分块处理（字符数）
const MAX_CHUNK_SIZE = parseInt(process.env.PRD_MAX_CHUNK_SIZE || '8000', 10);
// 每个块的最小大小，避免过度拆分
const MIN_CHUNK_SIZE = parseInt(process.env.PRD_MIN_CHUNK_SIZE || '2000', 10);

export interface PRDDocument {
  prdId?: string;
  title: string;
  description?: string;
  content: string;
  version?: string;
  status?: string;
  author?: string;
}

interface DocumentChunk {
  title: string;
  content: string;
  sectionIndex: number;
}

export class PRDParser {
  private aiClient: AIClient;

  constructor() {
    logger.start('constructor');
    this.aiClient = new AIClient();
    logger.end('constructor');
  }

  /**
   * 解析 PRD 文件
   */
  async parseFile(filePath: string): Promise<PRDDocument> {
    const startTime = Date.now();
    logger.start('parseFile', { filePath });

    try {
      const content = readFileSync(filePath, 'utf-8');
      logger.debug('File read successfully', {
        filePath,
        contentLength: content.length
      });

      const { data, content: markdown } = matter(content);

      const prd: PRDDocument = {
        prdId: data.prdId || data.prd_id,
        title: data.title || this.extractTitle(markdown),
        description: data.description,
        content: markdown,
        version: data.version || '1.0.0',
        status: data.status || 'draft',
        author: data.author
      };

      const duration = Date.now() - startTime;
      logger.info('PRD parsed successfully', {
        filePath,
        title: prd.title,
        duration: `${duration}ms`
      });
      logger.end('parseFile', { title: prd.title }, duration);

      return prd;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to parse PRD file', error, {
        filePath,
        duration: `${duration}ms`
      });
      logger.end('parseFile', { success: false }, duration);
      throw error;
    }
  }

  /**
   * 解析 PRD 字符串内容
   */
  async parseContent(content: string, virtualFilePath: string = 'inline-prd.md'): Promise<PRDDocument> {
    const startTime = Date.now();
    logger.start('parseContent', { virtualFilePath, contentLength: content.length });

    try {
      const { data, content: markdown } = matter(content);

      const prd: PRDDocument = {
        prdId: data.prdId || data.prd_id,
        title: data.title || this.extractTitle(markdown),
        description: data.description,
        content: markdown,
        version: data.version || '1.0.0',
        status: data.status || 'draft',
        author: data.author
      };

      const duration = Date.now() - startTime;
      logger.info('PRD content parsed successfully', {
        virtualFilePath,
        title: prd.title,
        duration: `${duration}ms`
      });
      logger.end('parseContent', { title: prd.title }, duration);

      return prd;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to parse PRD content', error, {
        virtualFilePath,
        duration: `${duration}ms`
      });
      logger.end('parseContent', { success: false }, duration);
      throw error;
    }
  }

  /**
   * 使用 AI 将 PRD 转换为测试用例
   */
  async convertPRDToTestCases(prd: PRDDocument): Promise<TestCase[]> {
    const startTime = Date.now();
    logger.start('convertPRDToTestCases', {
      prdTitle: prd.title,
      contentLength: prd.content.length
    });

    try {
      // 检查文档大小，决定是否需要分块处理
      const shouldChunk = prd.content.length > MAX_CHUNK_SIZE;

      if (shouldChunk) {
        logger.info('Document is too large, splitting into chunks', {
          contentLength: prd.content.length,
          maxChunkSize: MAX_CHUNK_SIZE
        });
        return await this.convertPRDToTestCasesChunked(prd);
      }

      const prompt = this.buildConversionPrompt(prd);
      logger.debug('Built conversion prompt', { promptLength: prompt.length });

      logger.info('Calling AI API to convert PRD to test cases', {
        model: this.aiClient['model'],
        prdTitle: prd.title
      });

      const apiKey = process.env.API_KEY || '';
      const baseURL = process.env.BASE_URL || '';
      const defaultModel = process.env.DEFAULT_MODEL || 'glm-4.5';

      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({
        apiKey,
        baseURL
      });

      const response = await client.chat.completions.create({
        model: defaultModel,
        messages: [
          {
            role: 'system',
            content: PRD_PARSER_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const apiDuration = Date.now() - startTime;
      logger.debug('AI API response received', {
        duration: `${apiDuration}ms`,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : undefined
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        logger.error('AI response is empty');
        throw new Error('AI response is empty');
      }

      logger.debug('AI response content', {
        contentLength: responseContent.length,
        contentPreview: responseContent.substring(0, 200)
      });

      // 解析 JSON 响应
      let parsedResult: any;
      try {
        parsedResult = JSON.parse(responseContent);
        logger.debug('Successfully parsed JSON directly');
      } catch (e) {
        logger.warn('Direct JSON parse failed, trying alternative methods', {
          error: e instanceof Error ? e.message : String(e)
        });
        // 尝试提取 JSON 代码块
        const jsonMatch = responseContent.match(/```(?:json)?\n?([\s\S]*?)\n?```/) ||
          responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
          logger.debug('Successfully parsed JSON from code block');
        } else {
          logger.error('All JSON parsing methods failed', {
            contentPreview: responseContent.substring(0, 500)
          });
          throw new Error(`Failed to parse AI response: ${responseContent.substring(0, 200)}`);
        }
      }

      // 转换为 TestCase 数组
      const testCases: TestCase[] = [];
      let testCasesArray: any[] = [];

      // 处理不同的响应格式
      if (Array.isArray(parsedResult)) {
        testCasesArray = parsedResult;
      } else if (parsedResult.testCases && Array.isArray(parsedResult.testCases)) {
        testCasesArray = parsedResult.testCases;
      } else if (parsedResult.test_cases && Array.isArray(parsedResult.test_cases)) {
        testCasesArray = parsedResult.test_cases;
      } else {
        throw new Error('AI response does not contain a valid test cases array');
      }

      testCasesArray.forEach((tc: any, index: number) => {
        logger.debug(`Processing test case ${index + 1}`, {
          id: tc.id,
          title: tc.title
        });

        testCases.push({
          id: tc.id || `TC-GENERATED-${index + 1}`,
          title: tc.title || '',
          module: tc.module || prd.title,
          priority: tc.priority || 'P1',
          testType: tc.testType || '功能测试',
          preconditions: Array.isArray(tc.preconditions) ? tc.preconditions : [],
          steps: Array.isArray(tc.steps) ? tc.steps : [],
          expectedResults: Array.isArray(tc.expectedResults) ? tc.expectedResults : [],
          entryUrl: tc.entryUrl,
          system: tc.system || '测试环境',
          testObjective: tc.testObjective || `基于PRD: ${prd.title}生成的测试用例`
        });
      });

      const duration = Date.now() - startTime;
      logger.info('Successfully converted PRD to test cases', {
        prdTitle: prd.title,
        testCaseCount: testCases.length,
        duration: `${duration}ms`
      });
      logger.end('convertPRDToTestCases', { testCaseCount: testCases.length }, duration);

      return testCases;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error converting PRD to test cases', error, {
        prdTitle: prd.title,
        duration: `${duration}ms`
      });
      logger.end('convertPRDToTestCases', { success: false }, duration);
      throw error;
    }
  }

  /**
   * 分块处理大文档并生成测试用例
   */
  private async convertPRDToTestCasesChunked(prd: PRDDocument): Promise<TestCase[]> {
    const startTime = Date.now();
    logger.start('convertPRDToTestCasesChunked', {
      prdTitle: prd.title,
      contentLength: prd.content.length
    });

    try {
      // 将文档拆分为多个块
      const chunks = this.splitDocumentIntoChunks(prd);
      logger.info('Document split into chunks', {
        chunkCount: chunks.length,
        chunks: chunks.map(c => ({ title: c.title, size: c.content.length }))
      });

      // 为每个块生成测试用例
      const allTestCases: TestCase[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        logger.info(`Processing chunk ${i + 1}/${chunks.length}`, {
          chunkTitle: chunk.title,
          chunkSize: chunk.content.length
        });

        try {
          const chunkPRD: PRDDocument = {
            ...prd,
            content: chunk.content,
            title: `${prd.title} - ${chunk.title}`
          };

          const chunkTestCases = await this.convertSingleChunkToTestCases(chunkPRD, chunk);
          allTestCases.push(...chunkTestCases);

          logger.info(`Chunk ${i + 1} processed successfully`, {
            testCaseCount: chunkTestCases.length
          });
        } catch (error) {
          logger.error(`Failed to process chunk ${i + 1}`, error, {
            chunkTitle: chunk.title
          });
          // 继续处理其他块，不中断整个流程
        }
      }

      // 去重和合并测试用例
      const uniqueTestCases = this.deduplicateTestCases(allTestCases);

      const duration = Date.now() - startTime;
      logger.info('Successfully converted chunked PRD to test cases', {
        prdTitle: prd.title,
        originalChunkCount: chunks.length,
        totalTestCases: allTestCases.length,
        uniqueTestCases: uniqueTestCases.length,
        duration: `${duration}ms`
      });
      logger.end('convertPRDToTestCasesChunked', {
        testCaseCount: uniqueTestCases.length
      }, duration);

      return uniqueTestCases;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error converting chunked PRD to test cases', error, {
        prdTitle: prd.title,
        duration: `${duration}ms`
      });
      logger.end('convertPRDToTestCasesChunked', { success: false }, duration);
      throw error;
    }
  }

  /**
   * 将文档拆分为多个块
   * 优先按章节（## 标题）拆分，如果章节太大则进一步拆分
   */
  private splitDocumentIntoChunks(prd: PRDDocument): DocumentChunk[] {
    const content = prd.content;
    const chunks: DocumentChunk[] = [];

    // 按二级标题（##）拆分
    const sections = this.splitByHeaders(content, /^##\s+(.+)$/m);

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // 如果章节仍然太大，进一步拆分
      if (section.content.length > MAX_CHUNK_SIZE) {
        logger.debug('Section is still too large, splitting further', {
          sectionTitle: section.title,
          sectionSize: section.content.length
        });

        // 按三级标题（###）或段落进一步拆分
        const subSections = this.splitByHeaders(section.content, /^###\s+(.+)$/m);

        if (subSections.length > 1) {
          // 有子章节，按子章节拆分
          subSections.forEach((subSection, subIndex) => {
            chunks.push({
              title: `${section.title} - ${subSection.title}`,
              content: subSection.content,
              sectionIndex: i * 100 + subIndex
            });
          });
        } else {
          // 没有子章节，按固定大小拆分
          const fixedChunks = this.splitBySize(section.content, MAX_CHUNK_SIZE);
          fixedChunks.forEach((chunk, chunkIndex) => {
            chunks.push({
              title: `${section.title} (Part ${chunkIndex + 1})`,
              content: chunk,
              sectionIndex: i * 100 + chunkIndex
            });
          });
        }
      } else {
        chunks.push({
          title: section.title,
          content: section.content,
          sectionIndex: i
        });
      }
    }

    return chunks;
  }

  /**
   * 按标题拆分文档
   */
  private splitByHeaders(content: string, headerPattern: RegExp): Array<{ title: string; content: string }> {
    const sections: Array<{ title: string; content: string }> = [];
    const lines = content.split('\n');

    let currentTitle = '概述';
    let currentContent: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(headerPattern);
      if (headerMatch) {
        // 保存当前章节
        if (currentContent.length > 0) {
          sections.push({
            title: currentTitle,
            content: currentContent.join('\n')
          });
        }
        // 开始新章节
        currentTitle = headerMatch[1].trim();
        currentContent = [line];
      } else {
        currentContent.push(line);
      }
    }

    // 添加最后一个章节
    if (currentContent.length > 0) {
      sections.push({
        title: currentTitle,
        content: currentContent.join('\n')
      });
    }

    return sections.length > 0 ? sections : [{ title: '全部内容', content }];
  }

  /**
   * 按固定大小拆分内容，尽量在段落边界断开
   */
  private splitBySize(content: string, maxSize: number): string[] {
    const chunks: string[] = [];
    const paragraphs = content.split(/\n\n+/);

    let currentChunk: string[] = [];
    let currentSize = 0;

    for (const paragraph of paragraphs) {
      const paragraphSize = paragraph.length + 2; // +2 for \n\n

      if (currentSize + paragraphSize > maxSize && currentChunk.length > 0) {
        // 当前块已满，保存并开始新块
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [paragraph];
        currentSize = paragraphSize;
      } else {
        currentChunk.push(paragraph);
        currentSize += paragraphSize;
      }
    }

    // 添加最后一个块
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
    }

    return chunks.length > 0 ? chunks : [content];
  }

  /**
   * 处理单个文档块并生成测试用例
   */
  private async convertSingleChunkToTestCases(chunkPRD: PRDDocument, chunk: DocumentChunk): Promise<TestCase[]> {
    const prompt = this.buildConversionPrompt(chunkPRD);

    const apiKey = process.env.API_KEY || '';
    const baseURL = process.env.BASE_URL || '';
    const defaultModel = process.env.DEFAULT_MODEL || 'glm-4.5';

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey,
      baseURL
    });

    const response = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        {
          role: 'system',
          content: PRD_CHUNK_PARSER_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('AI response is empty');
    }

    // 解析 JSON 响应
    let parsedResult: any;
    try {
      parsedResult = JSON.parse(responseContent);
    } catch (e) {
      const jsonMatch = responseContent.match(/```(?:json)?\n?([\s\S]*?)\n?```/) ||
        responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        throw new Error(`Failed to parse AI response: ${responseContent.substring(0, 200)}`);
      }
    }

    // 转换为 TestCase 数组
    const testCases: TestCase[] = [];
    let testCasesArray: any[] = [];

    if (Array.isArray(parsedResult)) {
      testCasesArray = parsedResult;
    } else if (parsedResult.testCases && Array.isArray(parsedResult.testCases)) {
      testCasesArray = parsedResult.testCases;
    } else if (parsedResult.test_cases && Array.isArray(parsedResult.test_cases)) {
      testCasesArray = parsedResult.test_cases;
    } else {
      throw new Error('AI response does not contain a valid test cases array');
    }

    testCasesArray.forEach((tc: any, index: number) => {
      testCases.push({
        id: tc.id || `TC-${chunk.sectionIndex}-${index + 1}`,
        title: tc.title || '',
        module: tc.module || chunkPRD.title,
        priority: tc.priority || 'P1',
        testType: tc.testType || '功能测试',
        preconditions: Array.isArray(tc.preconditions) ? tc.preconditions : [],
        steps: Array.isArray(tc.steps) ? tc.steps : [],
        expectedResults: Array.isArray(tc.expectedResults) ? tc.expectedResults : [],
        entryUrl: tc.entryUrl,
        system: tc.system || '测试环境',
        testObjective: tc.testObjective || `基于PRD章节: ${chunk.title}生成的测试用例`
      });
    });

    return testCases;
  }

  /**
   * 去重测试用例（基于ID和标题）
   */
  private deduplicateTestCases(testCases: TestCase[]): TestCase[] {
    const seen = new Set<string>();
    const unique: TestCase[] = [];

    for (const testCase of testCases) {
      // 使用 ID 和标题的组合作为唯一标识
      const key = `${testCase.id}|${testCase.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(testCase);
      }
    }

    logger.debug('Deduplicated test cases', {
      originalCount: testCases.length,
      uniqueCount: unique.length,
      removedCount: testCases.length - unique.length
    });

    return unique;
  }

  /**
   * 构建转换提示词
   */
  private buildConversionPrompt(prd: PRDDocument): string {
    return `请根据以下产品需求文档（PRD）生成测试用例：

PRD 标题：${prd.title}
${prd.description ? `PRD 描述：${prd.description}\n` : ''}
PRD 内容：
${prd.content}

请生成全面的测试用例，包括正常流程、异常流程、边界值测试等。`;
  }

  /**
   * 从 Markdown 内容中提取标题
   */
  private extractTitle(content: string): string {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : 'Untitled PRD';
  }
}

