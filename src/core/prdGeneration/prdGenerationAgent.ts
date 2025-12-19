import OpenAI from 'openai';
import { PRDSchemaData } from '../../types/prdGeneration.js';
import { createLogger } from '../../utils/logger.js';
import { RAGRetriever, RetrievedContext } from './ragRetriever.js';
import { PRD_GENERATION_SYSTEM_PROMPT, buildPRDGenerationUserPrompt } from '../../prompts/prdGeneration/generation.js';
import { PARAGRAPH_REGENERATION_SYSTEM_PROMPT, buildParagraphRegenerationUserPrompt } from '../../prompts/prdGeneration/paragraphRegeneration.js';

const logger = createLogger('PRDGenerationAgent');

export class PRDGenerationAgent {
    private client: OpenAI;
    public ragRetriever: RAGRetriever;

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

        this.ragRetriever = new RAGRetriever();
    }

    /**
     * 根据Schema生成PRD Markdown文档
     */
    async generatePRD(
        schema: PRDSchemaData,
        template?: string,
        useRAG: boolean = true,
        appId?: string
    ): Promise<string> {
        const startTime = Date.now();
        logger.start('generatePRD', {
            hasProductOverview: !!schema.productOverview,
            functionalRequirementsCount: schema.functionalRequirements?.length || 0,
            appId: appId || undefined
        });

        try {
            // 使用RAG检索相关的历史PRD（只检索相同应用的PRD）
            let ragContext = '';
            if (useRAG) {
                try {
                    const relevantPRDs = await this.ragRetriever.retrieveRelevantPRDs(schema, 5, appId); // 默认检索5个PRD
                    if (relevantPRDs.length > 0) {
                        ragContext = this.ragRetriever.formatContextForPrompt(relevantPRDs);
                        logger.info('RAG context retrieved', {
                            prdCount: relevantPRDs.length,
                            appId: appId || undefined
                        });
                    } else if (appId) {
                        logger.info('No relevant PRDs found for app', { appId });
                    }
                } catch (error) {
                    logger.warn('RAG retrieval failed, continuing without context', error);
                }
            }

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                {
                    role: 'system',
                    content: PRD_GENERATION_SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: buildPRDGenerationUserPrompt(schema, template, ragContext)
                }
            ];

            logger.info('Calling AI for PRD generation', {
                useRAG: !!ragContext,
                ragContextLength: ragContext.length,
                schemaFunctionalRequirements: schema.functionalRequirements?.length || 0,
                model: process.env.DEFAULT_MODEL || 'glm-4.5',
                maxTokens: 8000
            });

            const aiCallStartTime = Date.now();
            const response = await this.client.chat.completions.create({
                model: process.env.DEFAULT_MODEL || 'glm-4.5',
                messages,
                temperature: 0.5, // 稍微提高温度以获得更自然的语言
                max_tokens: 8000 // 增加token限制以生成完整PRD（约4000-6000字）
            });

            const aiCallDuration = Date.now() - aiCallStartTime;
            logger.info('AI PRD generation API call completed', {
                duration: aiCallDuration,
                usage: response.usage ? {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens,
                    estimatedCost: response.usage.total_tokens * 0.00001 // 估算成本（示例）
                } : undefined
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                logger.error('AI PRD response is empty', undefined, {
                    responseChoices: response.choices?.length || 0
                });
                throw new Error('AI response is empty');
            }

            logger.info('PRD content generated', {
                contentLength: content.length,
                contentPreview: content.substring(0, 300),
                estimatedWordCount: Math.round(content.length / 2) // 粗略估算字数
            });

            const duration = Date.now() - startTime;
            logger.info('PRD generated successfully', {
                contentLength: content.length,
                duration: `${duration}ms`
            });
            logger.end('generatePRD', { success: true }, duration);

            return content;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error generating PRD', error, {
                duration: `${duration}ms`
            });
            logger.end('generatePRD', { success: false }, duration);
            throw error;
        }
    }


    /**
     * 段落级重生成（用于前端编辑功能）
     */
    async regenerateParagraph(
        schema: PRDSchemaData,
        sectionTitle: string,
        context: string,
        useRAG: boolean = true,
        appId?: string
    ): Promise<string> {
        const startTime = Date.now();
        logger.start('regenerateParagraph', { sectionTitle, appId: appId || undefined });

        try {
            // 使用RAG检索相关的历史PRD（针对特定章节，只检索相同应用的PRD）
            let ragContext = '';
            if (useRAG) {
                try {
                    const relevantPRDs = await this.ragRetriever.retrieveRelevantPRDs(schema, 3, appId); // 段落重生成时使用更少的参考文档
                    if (relevantPRDs.length > 0) {
                        // 提取相关章节的内容
                        const sectionContexts = relevantPRDs.map(prd => {
                            const sectionContent = this.extractSectionFromPRD(prd.content, sectionTitle);
                            return sectionContent ? `### ${prd.title} - ${sectionTitle}\n\n${sectionContent}` : null;
                        }).filter(Boolean).join('\n\n---\n\n');

                        if (sectionContexts) {
                            ragContext = `\n\n## 参考的历史PRD中相同章节的内容：\n\n${sectionContexts}\n\n请参考以上历史PRD中相同章节的结构和内容风格。`;
                        }
                    }
                } catch (error) {
                    logger.warn('RAG retrieval failed for paragraph regeneration', error);
                }
            }

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                {
                    role: 'system',
                    content: PARAGRAPH_REGENERATION_SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: buildParagraphRegenerationUserPrompt(schema, sectionTitle, context, ragContext)
                }
            ];

            const response = await this.client.chat.completions.create({
                model: process.env.DEFAULT_MODEL || 'glm-4.5',
                messages,
                temperature: 0.5,
                max_tokens: 2000
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('AI response is empty');
            }

            const duration = Date.now() - startTime;
            logger.info('Paragraph regenerated', {
                sectionTitle,
                contentLength: content.length,
                duration: `${duration}ms`
            });
            logger.end('regenerateParagraph', { success: true }, duration);

            return content;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error regenerating paragraph', error, {
                sectionTitle,
                duration: `${duration}ms`
            });
            logger.end('regenerateParagraph', { success: false }, duration);
            throw error;
        }
    }

    /**
     * 从PRD内容中提取特定章节
     */
    private extractSectionFromPRD(content: string, sectionTitle: string): string | null {
        // 尝试匹配章节标题（支持多种格式）
        const patterns = [
            new RegExp(`##+\\s*${sectionTitle}[\\s\\S]*?(?=##|$)`, 'i'),
            new RegExp(`#+\\s*${sectionTitle}[\\s\\S]*?(?=#|$)`, 'i')
        ];

        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return match[0].trim();
            }
        }

        return null;
    }
}

