import OpenAI from 'openai';
import { ClarificationResponse, PRDSchemaData } from '../../types/prdGeneration.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ClarificationAgent');

export class ClarificationAgent {
    private client: OpenAI;

    constructor() {
        const apiKey = process.env.API_KEY || '';
        const baseURL = process.env.BASE_URL || '';
        const defaultModel = process.env.DEFAULT_MODEL || 'glm-4.5';

        if (!apiKey || !baseURL) {
            throw new Error('API_KEY and BASE_URL must be set in environment variables');
        }

        this.client = new OpenAI({
            apiKey,
            baseURL
        });
    }

    /**
     * 分析需求完整度并生成追问问题
     */
    async clarifyRequirements(
        requirementText: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
    ): Promise<ClarificationResponse> {
        const startTime = Date.now();
        logger.start('clarifyRequirements', {
            requirementLength: requirementText.length,
            historyLength: conversationHistory.length
        });

        try {
            logger.info('Calling AI for requirement clarification', {
                requirementLength: requirementText.length,
                conversationHistoryLength: conversationHistory.length,
                model: process.env.DEFAULT_MODEL || 'glm-4.5'
            });

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                {
                    role: 'system',
                    content: `你是一个专业的产品需求分析师。你的任务是分析用户输入的产品需求，判断需求是否完整，并生成追问问题来补全缺失的信息。

请分析需求并返回JSON格式，包含以下字段：
- isComplete: boolean - 需求是否完整
- questions: Array<{question: string, field?: string, required: boolean}> - 追问问题列表
- structuredDraft: object - 结构化需求草稿（如果信息足够）

需求分析要点：
1. 产品名称和定位
2. 目标用户群体
3. 核心功能需求（至少3-5个）
4. 用户场景和使用流程
5. 非功能需求（性能、安全、兼容性等）
6. 业务规则和约束

如果需求信息不足，请生成针对性的追问问题。如果信息足够，isComplete设为true，并返回structuredDraft。`
                },
                {
                    role: 'user',
                    content: this.buildClarificationPrompt(requirementText, conversationHistory)
                }
            ];

            const aiCallStartTime = Date.now();
            const response = await this.client.chat.completions.create({
                model: process.env.DEFAULT_MODEL || 'glm-4.5',
                messages,
                temperature: 0.3,
                response_format: { type: 'json_object' }
            });

            const aiCallDuration = Date.now() - aiCallStartTime;
            logger.info('AI clarification API call completed', {
                duration: aiCallDuration,
                usage: response.usage ? {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens
                } : undefined
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                logger.error('AI response is empty', undefined, {
                    responseChoices: response.choices?.length || 0
                });
                throw new Error('AI response is empty');
            }

            logger.debug('AI response received', {
                contentLength: content.length,
                contentPreview: content.substring(0, 200),
                fullContent: content
            });

            // 解析JSON响应
            logger.debug('Parsing AI response JSON', { contentLength: content.length });
            let parsedResult: any;
            try {
                parsedResult = JSON.parse(content);
                logger.debug('JSON parsed successfully', {
                    hasIsComplete: 'isComplete' in parsedResult,
                    questionsCount: parsedResult.questions?.length || 0,
                    hasStructuredDraft: !!parsedResult.structuredDraft
                });
            } catch (e) {
                logger.warn('Direct JSON parse failed, trying alternative methods', {
                    error: e instanceof Error ? e.message : String(e),
                    contentPreview: content.substring(0, 300)
                });

                const jsonMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/) ||
                    content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsedResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                    logger.debug('JSON parsed from code block', {
                        hasIsComplete: 'isComplete' in parsedResult
                    });
                } else {
                    logger.error('All JSON parsing methods failed', undefined, {
                        contentPreview: content.substring(0, 500),
                        contentLength: content.length
                    });
                    throw new Error(`Failed to parse AI response: ${content.substring(0, 200)}`);
                }
            }

            const result: ClarificationResponse = {
                isComplete: parsedResult.isComplete === true,
                questions: Array.isArray(parsedResult.questions) ? parsedResult.questions : [],
                structuredDraft: parsedResult.structuredDraft || undefined
            };

            const duration = Date.now() - startTime;
            logger.info('Requirements clarified', {
                isComplete: result.isComplete,
                questionsCount: result.questions.length,
                duration: `${duration}ms`
            });
            logger.end('clarifyRequirements', { isComplete: result.isComplete }, duration);

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error clarifying requirements', error, {
                duration: `${duration}ms`
            });
            logger.end('clarifyRequirements', { success: false }, duration);
            throw error;
        }
    }

    /**
     * 构建澄清提示词
     */
    private buildClarificationPrompt(
        requirementText: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
    ): string {
        let prompt = `请分析以下产品需求：\n\n${requirementText}\n\n`;

        if (conversationHistory.length > 0) {
            prompt += '\n对话历史：\n';
            conversationHistory.forEach((msg, index) => {
                prompt += `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}\n`;
            });
            prompt += '\n请基于以上对话历史，继续分析需求完整度。\n';
        }

        return prompt;
    }
}

