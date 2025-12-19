import OpenAI from 'openai';
import { ClarificationResponse, PRDSchemaData } from '../../types/prdGeneration.js';
import { createLogger } from '../../utils/logger.js';
import { RAGRetriever } from './ragRetriever.js';
import { CLARIFICATION_SYSTEM_PROMPT, buildClarificationUserPrompt } from '../../prompts/prdGeneration/clarification.js';

const logger = createLogger('ClarificationAgent');

export class ClarificationAgent {
    private client: OpenAI;
    private ragRetriever: RAGRetriever;

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
            // 检索相关的历史PRD，提取已有信息（只检索相同应用的PRD）
            let historicalContext = '';
            let appId: string | undefined = undefined;
            try {
                // 尝试从需求文本中提取应用标识
                appId = this.extractAppIdFromRequirement(requirementText);

                logger.info('Retrieving historical PRDs for clarification', {
                    requirementLength: requirementText.length,
                    appId: appId || undefined
                });

                // 从需求文本中提取关键词用于检索
                const draftSchema = this.extractDraftSchemaFromRequirement(requirementText);
                const relevantPRDs = await this.ragRetriever.retrieveRelevantPRDs(draftSchema, 3, appId);

                if (relevantPRDs.length > 0) {
                    historicalContext = this.extractHistoricalInfo(relevantPRDs);
                    logger.info('Historical PRD context extracted', {
                        prdCount: relevantPRDs.length,
                        contextLength: historicalContext.length
                    });
                } else {
                    logger.info('No relevant historical PRDs found');
                }
            } catch (error) {
                logger.warn('Failed to retrieve historical PRDs, continuing without context', error);
                // 继续执行，不影响主流程
            }

            logger.info('Calling AI for requirement clarification', {
                requirementLength: requirementText.length,
                conversationHistoryLength: conversationHistory.length,
                hasHistoricalContext: !!historicalContext,
                model: process.env.DEFAULT_MODEL || 'glm-4.5'
            });

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                {
                    role: 'system',
                    content: CLARIFICATION_SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: buildClarificationUserPrompt(requirementText, conversationHistory, historicalContext)
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
     * 从需求文本中提取应用ID
     */
    private extractAppIdFromRequirement(requirementText: string): string | undefined {
        // 尝试从需求文本中识别应用名称，然后查找对应的appId
        // 这里可以扩展更智能的匹配逻辑
        // 暂时返回undefined，由用户选择应用
        return undefined;
    }

    /**
     * 从需求文本中提取草稿Schema用于RAG检索
     */
    private extractDraftSchemaFromRequirement(requirementText: string): Partial<PRDSchemaData> {
        // 简单提取产品名称和关键词
        const lines = requirementText.split('\n');
        const keywords: string[] = [];

        // 提取可能的产品名称（通常在开头）
        const firstLine = lines[0]?.trim() || '';
        if (firstLine && firstLine.length < 50) {
            keywords.push(firstLine);
        }

        // 提取所有非空行作为关键词
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && trimmed.length > 3 && trimmed.length < 100) {
                keywords.push(trimmed);
            }
        });

        return {
            productOverview: {
                productDescription: requirementText.substring(0, 500)
            },
            functionalRequirements: keywords.slice(0, 10).map((keyword, index) => ({
                id: `FR-${index + 1}`,
                title: keyword,
                description: keyword,
                priority: 'P1' as const
            }))
        };
    }

    /**
     * 从历史PRD中提取关键信息（产品类型、目标用户等）
     */
    private extractHistoricalInfo(relevantPRDs: Array<{ prdId: string; title: string; content: string }>): string {
        const infoSections: string[] = [];

        for (const prd of relevantPRDs) {
            try {
                const section: string[] = [];
                section.push(`### 历史PRD: ${prd.title} (ID: ${prd.prdId})\n`);

                const content = prd.content;

                // 提取产品名称（从标题或内容中）
                const titleMatch = content.match(/^#\s+(.+)$/m) ||
                    content.match(/(?:产品名称|产品)[：:]\s*([^\n]+)/i);
                if (titleMatch) {
                    section.push(`- **产品名称**: ${titleMatch[1] || prd.title}`);
                } else if (prd.title) {
                    section.push(`- **产品名称**: ${prd.title}`);
                }

                // 提取产品类型（App、网站等）
                const productTypePatterns = [
                    /(?:产品类型|形式|平台|产品形式)[：:]\s*([^\n]+)/i,
                    /(?:是|为|属于)\s*([^\s，,。\n]+?)(?:App|网站|平台|系统|应用|小程序)/i,
                    /([^\s，,。\n]+?)(?:App|网站|平台|系统|应用|小程序)/i
                ];

                let productType: string | null = null;
                for (const pattern of productTypePatterns) {
                    const match = content.match(pattern);
                    if (match) {
                        productType = match[1] || match[0];
                        break;
                    }
                }
                if (productType) {
                    section.push(`- **产品类型**: ${productType}`);
                }

                // 提取目标用户
                const targetUserPatterns = [
                    /(?:目标用户|用户群体|面向用户|主要用户)[：:]\s*([^\n]+)/i,
                    /(?:面向|主要用户|目标群体)\s*([^\n，,。]+)/i,
                    /(?:用户|群体)[：:]\s*([^\n]+)/i
                ];

                let targetUser: string | null = null;
                for (const pattern of targetUserPatterns) {
                    const match = content.match(pattern);
                    if (match) {
                        targetUser = match[1] || match[0];
                        break;
                    }
                }
                if (targetUser) {
                    section.push(`- **目标用户**: ${targetUser}`);
                }

                // 提取产品描述
                const descriptionMatch = content.match(/(?:产品描述|描述|简介)[：:]\s*([^\n]+)/i);
                if (descriptionMatch) {
                    section.push(`- **产品描述**: ${descriptionMatch[1].substring(0, 200)}`);
                }

                // 提取主要功能
                const functionMatch = content.match(/(?:主要功能|核心功能|功能包括|功能)[：:]\s*([^\n]+)/i);
                if (functionMatch) {
                    section.push(`- **主要功能**: ${functionMatch[1].substring(0, 200)}`);
                }

                if (section.length > 1) {
                    infoSections.push(section.join('\n'));
                } else {
                    // 如果没提取到结构化信息，至少提供标题
                    infoSections.push(`### 历史PRD: ${prd.title} (ID: ${prd.prdId})\n- **产品名称**: ${prd.title}`);
                }
            } catch (error) {
                logger.warn('Failed to extract info from historical PRD', error, {
                    prdId: prd.prdId,
                    title: prd.title
                });
                // 如果提取失败，至少提供标题
                infoSections.push(`### 历史PRD: ${prd.title} (ID: ${prd.prdId})\n- **产品名称**: ${prd.title}`);
            }
        }

        return infoSections.join('\n\n---\n\n');
    }
}

