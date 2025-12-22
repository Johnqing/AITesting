import OpenAI from 'openai';
import { createLogger } from '../../utils/logger.js';
import { REQUIREMENT_TO_PRD_SYSTEM_PROMPT, buildRequirementToPrdUserPrompt } from '../../prompts/requirementToPrd/requirementToPrd.js';

const logger = createLogger('RequirementToPrdAgent');

/**
 * 从需求说明直接生成PRD的Agent
 * 不经过Schema步骤，直接从需求文本生成PRD文档
 */
export class RequirementToPrdAgent {
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
     * 从需求说明直接生成PRD文档
     * @param requirementText 需求说明文本
     * @returns PRD文档内容（Markdown格式）
     */
    async generatePRDFromRequirement(requirementText: string): Promise<string> {
        const startTime = Date.now();
        logger.start('generatePRDFromRequirement', {
            requirementLength: requirementText.length
        });

        try {
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                {
                    role: 'system',
                    content: REQUIREMENT_TO_PRD_SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: buildRequirementToPrdUserPrompt(requirementText)
                }
            ];

            logger.info('Calling AI for PRD generation from requirement', {
                requirementLength: requirementText.length,
                model: process.env.DEFAULT_MODEL || 'glm-4.5',
                maxTokens: 8000
            });

            const aiCallStartTime = Date.now();
            const response = await this.client.chat.completions.create({
                model: process.env.DEFAULT_MODEL || 'glm-4.5',
                messages,
                temperature: 0.5,
                max_tokens: 8000 // 增加token限制以生成完整PRD
            });

            const aiCallDuration = Date.now() - aiCallStartTime;
            logger.info('AI PRD generation API call completed', {
                duration: aiCallDuration,
                usage: response.usage ? {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens
                } : undefined
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                logger.error('AI PRD response is empty', undefined, {
                    responseChoices: response.choices?.length || 0
                });
                throw new Error('AI response is empty');
            }

            logger.info('PRD content generated from requirement', {
                contentLength: content.length,
                contentPreview: content.substring(0, 300),
                estimatedWordCount: Math.round(content.length / 2) // 粗略估算字数
            });

            const duration = Date.now() - startTime;
            logger.info('PRD generated successfully from requirement', {
                contentLength: content.length,
                duration: `${duration}ms`
            });
            logger.end('generatePRDFromRequirement', { success: true }, duration);

            return content;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error generating PRD from requirement', error, {
                duration: `${duration}ms`
            });
            logger.end('generatePRDFromRequirement', { success: false }, duration);
            throw error;
        }
    }
}

