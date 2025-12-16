import matter from 'gray-matter';
import { TestCase, CaseFile } from '../../types/case.js';
import { AIClient } from '../../adapters/ai/aiClient.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MarkdownCaseParser');

export class MarkdownCaseParser {
    private aiClient: AIClient | null = null;
    private useAI: boolean;

    constructor(useAI: boolean = true) {
        this.useAI = useAI;
        if (this.useAI) {
            logger.info('Initializing AI client for parsing');
            this.aiClient = new AIClient();
        } else {
            logger.info('Using regex parsing (AI disabled)');
        }
    }

    /**
     * 解析 Markdown 格式的测试用例文件
     */
    async parseFile(filePath: string, content: string): Promise<CaseFile> {
        const startTime = Date.now();
        logger.start('parseFile', { filePath });

        try {
            if (this.useAI) {
                logger.info('Using AI parsing', { filePath });
                try {
                    const result = await this.parseFileWithAI(filePath, content);
                    const duration = Date.now() - startTime;
                    logger.info('File parsed successfully with AI', {
                        filePath,
                        testCaseCount: result.testCases.length,
                        duration: `${duration}ms`
                    });
                    logger.end('parseFile', { testCaseCount: result.testCases.length }, duration);
                    return result;
                } catch (error) {
                    logger.warn('AI parsing failed, falling back to regex', error, { filePath });
                    const result = this.parseFileWithRegex(filePath, content);
                    const duration = Date.now() - startTime;
                    logger.info('File parsed successfully with regex (fallback)', {
                        filePath,
                        testCaseCount: result.testCases.length,
                        duration: `${duration}ms`
                    });
                    logger.end('parseFile', { testCaseCount: result.testCases.length }, duration);
                    return result;
                }
            } else {
                logger.info('Using regex parsing', { filePath });
                const result = this.parseFileWithRegex(filePath, content);
                const duration = Date.now() - startTime;
                logger.info('File parsed successfully with regex', {
                    filePath,
                    testCaseCount: result.testCases.length,
                    duration: `${duration}ms`
                });
                logger.end('parseFile', { testCaseCount: result.testCases.length }, duration);
                return result;
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Failed to parse file', error, { filePath, duration: `${duration}ms` });
            logger.end('parseFile', { success: false }, duration);
            throw error;
        }
    }

    /**
     * 使用 AI 大模型解析测试用例文件
     */
    private async parseFileWithAI(filePath: string, content: string): Promise<CaseFile> {
        const startTime = Date.now();
        logger.start('parseFileWithAI', { filePath });

        if (!this.aiClient) {
            logger.error('AI client not initialized');
            throw new Error('AI client not initialized');
        }

        const { data, content: markdown } = matter(content);
        logger.debug('Parsed front matter', {
            hasData: !!data,
            markdownLength: markdown.length
        });

        const prompt = `请解析以下 Markdown 格式的测试用例文件，提取所有测试用例信息。

要求：
1. 提取模块说明（## 模块说明 后面的内容）
2. 提取测试页面的入口URL（## 测试页面的入口url 后面的URL）
3. 提取所有测试用例（以 ## TC- 开头的部分）
4. 每个测试用例需要提取：ID、标题、功能模块、优先级、测试类型、前置条件、测试步骤、预期结果

请返回 JSON 格式，结构如下：
{
  "module": "模块说明",
  "entryUrl": "入口URL（如果有）",
  "testCases": [
    {
      "id": "TC-AUDIO-001",
      "title": "测试用例标题",
      "module": "功能模块",
      "priority": "P0",
      "testType": "功能测试",
      "preconditions": ["前置条件1", "前置条件2"],
      "steps": ["步骤1", "步骤2"],
      "expectedResults": ["预期结果1", "预期结果2"]
    }
  ]
}

测试用例文件内容：
${markdown}`;

        try {
            const apiKey = process.env.API_KEY || '';
            const baseURL = process.env.BASE_URL || '';
            const defaultModel = process.env.DEFAULT_MODEL || 'glm-4.5';

            const OpenAI = (await import('openai')).default;
            const client = new OpenAI({
                apiKey,
                baseURL
            });

            logger.info('Calling AI API to parse test case file', {
                filePath,
                model: defaultModel,
                promptLength: prompt.length
            });

            const response = await client.chat.completions.create({
                model: defaultModel,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专业的测试用例解析专家。请准确解析测试用例文件，提取所有结构化信息。只返回 JSON 格式，不要包含其他说明文字。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
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

            logger.debug('Parsed result structure', {
                hasModule: !!parsedResult.module,
                hasEntryUrl: !!parsedResult.entryUrl,
                testCaseCount: parsedResult.testCases?.length || 0
            });

            // 转换为 CaseFile 格式
            const testCases: TestCase[] = (parsedResult.testCases || []).map((tc: any, index: number) => {
                logger.debug(`Processing test case ${index + 1}`, {
                    id: tc.id,
                    title: tc.title
                });
                return {
                    id: tc.id || '',
                    title: tc.title || '',
                    module: tc.module || parsedResult.module || '',
                    priority: tc.priority || '',
                    testType: tc.testType || '',
                    preconditions: Array.isArray(tc.preconditions) ? tc.preconditions : [],
                    steps: Array.isArray(tc.steps) ? tc.steps : [],
                    expectedResults: Array.isArray(tc.expectedResults) ? tc.expectedResults : [],
                    entryUrl: parsedResult.entryUrl
                };
            });

            const duration = Date.now() - startTime;
            logger.info('Successfully parsed file with AI', {
                filePath,
                module: parsedResult.module || data.module || '',
                entryUrl: parsedResult.entryUrl,
                testCaseCount: testCases.length,
                duration: `${duration}ms`
            });

            logger.end('parseFileWithAI', { testCaseCount: testCases.length }, duration);

            return {
                filePath,
                module: parsedResult.module || data.module || '',
                entryUrl: parsedResult.entryUrl,
                testCases
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error parsing file with AI', error, {
                filePath,
                duration: `${duration}ms`
            });
            logger.end('parseFileWithAI', { success: false }, duration);
            throw error;
        }
    }

    /**
     * 使用正则表达式解析测试用例文件（后备方案）
     */
    private parseFileWithRegex(filePath: string, content: string): CaseFile {
        const startTime = Date.now();
        logger.start('parseFileWithRegex', { filePath });

        const { data, content: markdown } = matter(content);
        logger.debug('Parsed front matter', {
            hasData: !!data,
            markdownLength: markdown.length
        });

        const testCases: TestCase[] = [];
        let module = data.module || '';
        let entryUrl: string | undefined;

        // 提取入口URL
        const urlMatch = markdown.match(/测试页面的入口url\s*\n\*\s*(https?:\/\/[^\s]+)/);
        if (urlMatch) {
            entryUrl = urlMatch[1];
            logger.debug('Extracted entry URL', { entryUrl });
        }

        // 提取模块说明
        const moduleMatch = markdown.match(/## 模块说明\s*\n([^\n]+)/);
        if (moduleMatch) {
            module = moduleMatch[1].trim();
            logger.debug('Extracted module', { module });
        }

        // 分割测试用例（以 ## TC- 开头）
        const testCaseBlocks = markdown.split(/##\s*(TC-[A-Z0-9-]+:)/).filter(block => block.trim());
        logger.debug('Split test case blocks', { blockCount: testCaseBlocks.length });

        for (let i = 0; i < testCaseBlocks.length; i += 2) {
            if (i + 1 < testCaseBlocks.length) {
                const testCaseId = testCaseBlocks[i].trim();
                const testCaseContent = testCaseBlocks[i + 1];

                logger.debug('Parsing test case', { testCaseId });
                const testCase = this.parseTestCase(testCaseId, testCaseContent);
                if (testCase) {
                    testCase.entryUrl = entryUrl;
                    testCases.push(testCase);
                    logger.debug('Test case parsed successfully', {
                        id: testCase.id,
                        title: testCase.title,
                        stepsCount: testCase.steps.length
                    });
                } else {
                    logger.warn('Failed to parse test case', { testCaseId });
                }
            }
        }

        const duration = Date.now() - startTime;
        logger.info('File parsed successfully with regex', {
            filePath,
            module,
            entryUrl,
            testCaseCount: testCases.length,
            duration: `${duration}ms`
        });

        logger.end('parseFileWithRegex', { testCaseCount: testCases.length }, duration);

        return {
            filePath,
            module,
            entryUrl,
            testCases
        };
    }

    /**
     * 解析单个测试用例内容
     */
    private parseTestCase(id: string, content: string): TestCase | null {
        const lines = content.split('\n');

        // 提取标题
        const titleMatch = content.match(/TC-[A-Z0-9-]+:\s*(.+)/);
        const title = titleMatch ? titleMatch[1].trim() : '';

        // 提取功能模块
        const moduleMatch = content.match(/\*\*功能模块\*\*:\s*(.+)/);
        const module = moduleMatch ? moduleMatch[1].trim() : '';

        // 提取优先级
        const priorityMatch = content.match(/\*\*优先级\*\*:\s*(.+)/);
        const priority = priorityMatch ? priorityMatch[1].trim() : '';

        // 提取测试类型
        const testTypeMatch = content.match(/\*\*测试类型\*\*:\s*(.+)/);
        const testType = testTypeMatch ? testTypeMatch[1].trim() : '';

        // 提取前置条件
        const preconditions: string[] = [];
        const preconditionsStart = content.indexOf('**前置条件**:');
        if (preconditionsStart !== -1) {
            const preconditionsSection = content.substring(preconditionsStart);
            const preconditionsMatch = preconditionsSection.match(/\*\*前置条件\*\*:\s*\n((?:-\s*.+\n?)+)/);
            if (preconditionsMatch) {
                preconditionsMatch[1].split('\n').forEach(line => {
                    const match = line.match(/-\s*(.+)/);
                    if (match) {
                        preconditions.push(match[1].trim());
                    }
                });
            }
        }

        // 提取测试步骤
        const steps: string[] = [];
        const stepsStart = content.indexOf('**测试步骤**:');
        if (stepsStart !== -1) {
            const stepsSection = content.substring(stepsStart);
            const stepsMatch = stepsSection.match(/\*\*测试步骤\*\*:\s*\n((?:\d+\.\s*.+\n?)+)/);
            if (stepsMatch) {
                stepsMatch[1].split('\n').forEach(line => {
                    const match = line.match(/\d+\.\s*(.+)/);
                    if (match) {
                        steps.push(match[1].trim());
                    }
                });
            }
        }

        // 提取预期结果
        const expectedResults: string[] = [];
        const expectedStart = content.indexOf('**预期结果**:');
        if (expectedStart !== -1) {
            const expectedSection = content.substring(expectedStart);
            const expectedMatch = expectedSection.match(/\*\*预期结果\*\*:\s*\n((?:-\s*.+\n?)+)/);
            if (expectedMatch) {
                expectedMatch[1].split('\n').forEach(line => {
                    const match = line.match(/-\s*(.+)/);
                    if (match) {
                        expectedResults.push(match[1].trim());
                    }
                });
            }
        }

        if (!title || steps.length === 0) {
            return null;
        }

        return {
            id,
            title,
            module,
            priority,
            testType,
            preconditions,
            steps,
            expectedResults
        };
    }
}

