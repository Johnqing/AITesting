import OpenAI from 'openai';
import { ClarificationResponse, PRDSchemaData } from '../../types/prdGeneration.js';
import { createLogger } from '../../utils/logger.js';
import { RAGRetriever } from './ragRetriever.js';

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
                    content: `你是一个专业的产品需求分析师。你的任务是分析用户输入的产品需求，判断需求是否完整，并生成追问问题来补全缺失的信息。

请分析需求并返回JSON格式，包含以下字段：
- isComplete: boolean - 需求是否完整
- questions: Array<{question: string, field?: string, required: boolean}> - 追问问题列表（只包含关键问题）
- structuredDraft: object - 结构化需求草稿（尽可能自动填充所有可推断的信息）

## 关键原则：只问关键问题，其他细节自动生成

### 必须询问的关键问题（仅限以下情况）：
1. **核心功能的具体实现方式**：如果需求中只提到了功能名称，但没有说明具体如何实现、有什么特殊要求
2. **业务规则和约束**：如果涉及特殊的业务逻辑、数据规则、权限控制等
3. **差异化需求**：如果需求中有特殊要求或与常规做法不同的地方
4. **关键决策点**：如果缺少某个信息会导致无法确定产品方向或核心功能

### 应该自动生成的内容（不要询问）：
1. **非功能需求**：性能、安全、兼容性、可用性等，根据产品类型和功能自动推断
2. **用户场景**：根据功能需求自动生成典型使用场景和流程
3. **技术约束**：根据产品类型（Web、App、小程序等）自动推断
4. **产品概述细节**：产品描述、核心价值等，根据需求文本和历史PRD自动补充
5. **目标用户群体**：如果需求中没有明确说明，根据产品功能和类型自动推断
6. **验收标准**：根据功能描述自动生成合理的验收标准

### 历史PRD的使用：
- 如果提供了历史PRD参考信息，请充分利用这些信息自动填充：
  - 产品类型、目标用户、主要功能模式等可以直接复用
  - 非功能需求、技术约束等可以参考类似产品
  - 只针对当前需求中**独特**或**不明确**的部分生成追问问题

### 输出要求：
- **questions数组**：只包含真正关键的问题（通常0-3个），不要超过5个
- **structuredDraft**：尽可能完整，包含所有可以自动推断的信息
  - 即使某些字段不确定，也要提供合理的默认值或推断值
  - 对于不确定的内容，可以标注"待确认"，但不要因此不填充该字段
- **isComplete**：如果核心功能需求明确，即使有一些细节可以优化，也可以设为true

### 示例：
- ❌ 不要问："目标用户是什么？"（可以自动推断）
- ❌ 不要问："需要什么性能要求？"（可以自动生成）
- ❌ 不要问："有哪些用户场景？"（可以根据功能自动生成）
- ✅ 可以问："用户权限如何分级？"（如果涉及权限管理且需求中未说明）
- ✅ 可以问："数据同步策略是什么？"（如果涉及多端同步且需求中未说明）

如果需求信息足够明确（核心功能清晰），isComplete设为true，并返回完整的structuredDraft。`
                },
                {
                    role: 'user',
                    content: this.buildClarificationPrompt(requirementText, conversationHistory, historicalContext)
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
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
        historicalContext?: string
    ): string {
        let prompt = `请分析以下产品需求：\n\n${requirementText}\n\n`;

        if (historicalContext) {
            prompt += `\n## 参考的历史PRD信息：\n\n${historicalContext}\n\n`;
            prompt += `**重要**：请充分利用以上历史PRD信息自动填充以下内容（不要询问）：\n`;
            prompt += `- 产品类型、目标用户群体（如果历史PRD中有类似产品）\n`;
            prompt += `- 非功能需求（性能、安全、兼容性等，参考类似产品）\n`;
            prompt += `- 技术约束和业务规则（参考类似产品的做法）\n`;
            prompt += `- 用户场景模式（参考类似产品的场景设计）\n\n`;
            prompt += `**只针对当前需求中独特或不明确的关键点生成追问问题**。\n\n`;
        }

        if (conversationHistory.length > 0) {
            prompt += '\n## 对话历史：\n';
            conversationHistory.forEach((msg, index) => {
                prompt += `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}\n`;
            });
            prompt += '\n请基于以上对话历史和参考信息，继续分析需求完整度。\n';
        }

        prompt += `\n## 分析要求：\n`;
        prompt += `1. 优先自动生成所有可以推断的信息（非功能需求、用户场景、技术约束等）\n`;
        prompt += `2. 只对真正影响产品核心功能或业务逻辑的关键问题生成追问\n`;
        prompt += `3. 如果核心功能需求明确，即使细节可以优化，也尽量设为isComplete=true\n`;
        prompt += `4. structuredDraft要尽可能完整，包含所有可以自动填充的字段\n`;

        return prompt;
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

