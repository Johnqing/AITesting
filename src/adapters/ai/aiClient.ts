import OpenAI from 'openai';
import { TestCase } from '../../types/case.js';
import dotenv from 'dotenv';
import { createLogger } from '../../utils/logger.js';

dotenv.config();

const logger = createLogger('AI');

export interface PlaywrightAction {
    type: 'navigate' | 'click' | 'wait' | 'verify' | 'fill' | 'select' | 'screenshot';
    selector?: string;
    url?: string;
    text?: string;
    timeout?: number;
    expected?: string;
    description: string;
}

export class AIClient {
    private client: OpenAI;
    private model: string;

    constructor() {
        logger.start('constructor');
        const apiKey = process.env.API_KEY || '';
        const baseURL = process.env.BASE_URL || '';
        const defaultModel = process.env.DEFAULT_MODEL || 'glm-4.5';

        logger.debug('Initializing AI client', {
            baseURL,
            model: defaultModel,
            apiKeyLength: apiKey.length
        });

        if (!apiKey || !baseURL) {
            logger.error('Missing required environment variables', {
                hasApiKey: !!apiKey,
                hasBaseURL: !!baseURL
            });
            throw new Error('API_KEY and BASE_URL must be set in environment variables');
        }

        this.client = new OpenAI({
            apiKey,
            baseURL
        });
        this.model = defaultModel;
        logger.info('AI client initialized', { model: defaultModel });
        logger.end('constructor');
    }

    /**
     * 将测试用例转换为 Playwright 操作序列
     */
    async convertTestCaseToActions(testCase: TestCase): Promise<PlaywrightAction[]> {
        const startTime = Date.now();
        logger.start('convertTestCaseToActions', {
            testCaseId: testCase.id,
            testCaseTitle: testCase.title,
            stepsCount: testCase.steps.length
        });

        const prompt = this.buildPrompt(testCase);
        logger.debug('Built prompt', { promptLength: prompt.length });

        try {
            logger.info('Calling AI API to convert test case to actions', {
                model: this.model,
                testCaseId: testCase.id
            });

            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: `你是一个专业的测试自动化专家。你的任务是将自然语言描述的测试步骤转换为结构化的 Playwright 操作序列。

请将测试步骤转换为 JSON 格式的操作数组，每个操作包含以下字段：
- type: 操作类型（navigate, click, wait, verify, fill, select, screenshot）
- selector: CSS选择器或文本内容（用于定位元素）
- url: 导航的URL（仅当type为navigate时）
- text: 要输入或验证的文本内容
- timeout: 超时时间（毫秒，可选，默认5000）
- expected: 预期结果（用于verify类型）
- description: 操作描述

操作类型说明：
- navigate: 导航到指定URL
- click: 点击元素（通过selector定位）
- wait: 等待页面加载或元素出现
- verify: 验证元素或文本是否存在
- fill: 填写表单
- select: 选择下拉选项
- screenshot: 截图

请只返回 JSON 数组，不要包含其他说明文字。`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' }
            });

            const duration = Date.now() - startTime;
            logger.debug('AI API response received', {
                duration: `${duration}ms`,
                usage: response.usage ? {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens
                } : undefined
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                logger.error('AI response is empty');
                throw new Error('AI response is empty');
            }

            logger.debug('AI response content', {
                contentLength: content.length,
                contentPreview: content.substring(0, 200)
            });

            // 尝试解析 JSON
            let result;
            try {
                // 首先尝试直接解析
                result = JSON.parse(content);
                logger.debug('Successfully parsed JSON directly');
            } catch (e) {
                logger.warn('Direct JSON parse failed, trying alternative methods', {
                    error: e instanceof Error ? e.message : String(e)
                });

                // 如果失败，尝试提取 JSON 代码块
                const jsonBlockMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
                if (jsonBlockMatch) {
                    try {
                        result = JSON.parse(jsonBlockMatch[1]);
                        logger.debug('Successfully parsed JSON from code block');
                    } catch (e2) {
                        logger.warn('Code block parse failed, trying array extraction');
                        // 尝试提取数组部分
                        const arrayMatch = content.match(/\[[\s\S]*\]/);
                        if (arrayMatch) {
                            result = JSON.parse(arrayMatch[0]);
                            logger.debug('Successfully parsed JSON from array match');
                        } else {
                            logger.error('All JSON parsing methods failed', {
                                contentPreview: content.substring(0, 500)
                            });
                            throw new Error(`Failed to parse AI response: ${content.substring(0, 200)}...`);
                        }
                    }
                } else {
                    // 尝试提取数组部分
                    const arrayMatch = content.match(/\[[\s\S]*\]/);
                    if (arrayMatch) {
                        result = JSON.parse(arrayMatch[0]);
                        logger.debug('Successfully parsed JSON from array match');
                    } else {
                        logger.error('All JSON parsing methods failed', {
                            contentPreview: content.substring(0, 500)
                        });
                        throw new Error(`Failed to parse AI response: ${content.substring(0, 200)}...`);
                    }
                }
            }

            // 确保返回的是数组
            if (!Array.isArray(result)) {
                logger.warn('AI response is not an array, attempting conversion', {
                    resultType: typeof result,
                    resultKeys: Object.keys(result)
                });

                if (result.actions && Array.isArray(result.actions)) {
                    result = result.actions;
                    logger.debug('Extracted actions array from result');
                } else if (result.steps && Array.isArray(result.steps)) {
                    result = result.steps;
                    logger.debug('Extracted steps array from result');
                } else {
                    logger.warn('Wrapping single result in array');
                    result = [result];
                }
            }

            const actionCount = Array.isArray(result) ? result.length : 0;
            logger.info('Successfully converted test case to actions', {
                testCaseId: testCase.id,
                actionCount,
                duration: `${Date.now() - startTime}ms`
            });
            logger.debug('Generated actions', { actions: result });

            logger.end('convertTestCaseToActions', { actionCount }, Date.now() - startTime);
            return result as PlaywrightAction[];
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error converting test case to actions', error, {
                testCaseId: testCase.id,
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 构建 AI Prompt
     */
    private buildPrompt(testCase: TestCase): string {
        logger.debug('Building prompt for test case', { testCaseId: testCase.id });
        const entryUrlNote = testCase.entryUrl 
            ? `\n重要提示：如果测试步骤中包含导航操作，请使用以下入口URL：${testCase.entryUrl}\n不要使用测试步骤中可能提到的其他URL（如example.com等占位符URL）。`
            : '';
        
        return `请将以下测试用例转换为 Playwright 操作序列：

测试用例ID: ${testCase.id}
标题: ${testCase.title}
功能模块: ${testCase.module}
优先级: ${testCase.priority}
测试类型: ${testCase.testType}

前置条件:
${testCase.preconditions.map(p => `- ${p}`).join('\n')}

测试步骤:
${testCase.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

预期结果:
${testCase.expectedResults.map(e => `- ${e}`).join('\n')}

${testCase.entryUrl ? `入口URL: ${testCase.entryUrl}` : ''}${entryUrlNote}

请根据测试步骤生成对应的 Playwright 操作序列，确保操作顺序正确，选择器准确。`;
    }
}

