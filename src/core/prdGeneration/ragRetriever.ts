import OpenAI from 'openai';
import { PRDSchemaData } from '../../types/prdGeneration.js';
import { prdService, PRDRecord } from '../../db/services/prdService.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('RAGRetriever');

export interface RetrievedContext {
    prdId: string;
    title: string;
    content: string;
    relevanceScore?: number;
}

export class RAGRetriever {
    private client: OpenAI;
    private maxRetrievedDocs: number;

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

        // 最多检索的PRD数量
        this.maxRetrievedDocs = parseInt(process.env.RAG_MAX_DOCS || '5', 10);
    }

    /**
     * 检索相关的历史PRD作为参考
     */
    async retrieveRelevantPRDs(
        schema: PRDSchemaData,
        limit: number = this.maxRetrievedDocs,
        appId?: string
    ): Promise<RetrievedContext[]> {
        const startTime = Date.now();
        logger.start('retrieveRelevantPRDs', {
            functionalRequirementsCount: schema.functionalRequirements?.length || 0,
            appId: appId || undefined
        });

        try {
            logger.info('Starting RAG retrieval', {
                limit,
                appId: appId || undefined,
                schemaFunctionalRequirements: schema.functionalRequirements?.length || 0
            });

            // 获取历史PRD（如果指定了appId，只获取该应用的PRD）
            const dbQueryStartTime = Date.now();
            const allPRDs = appId
                ? await prdService.getPRDsByAppId(appId)
                : await prdService.getAllPRDs();
            const dbQueryDuration = Date.now() - dbQueryStartTime;

            logger.info('Historical PRDs retrieved from database', {
                count: allPRDs.length,
                duration: dbQueryDuration,
                prdTitles: allPRDs.slice(0, 5).map(p => p.title)
            });

            if (allPRDs.length === 0) {
                logger.info('No historical PRDs found, skipping RAG', { limit });
                return [];
            }

            // 构建查询关键词
            const keywordsStartTime = Date.now();
            const queryKeywords = this.extractKeywords(schema);
            logger.info('Keywords extracted from schema', {
                keywordsLength: queryKeywords.length,
                keywordsPreview: queryKeywords.substring(0, 200),
                duration: Date.now() - keywordsStartTime
            });

            // 使用AI进行语义相似度匹配
            const rankingStartTime = Date.now();
            const relevantPRDs = await this.rankPRDsByRelevance(allPRDs, queryKeywords, limit);
            logger.info('PRDs ranked by relevance', {
                totalPRDs: allPRDs.length,
                retrievedCount: relevantPRDs.length,
                duration: Date.now() - rankingStartTime,
                retrievedTitles: relevantPRDs.map(p => p.title)
            });

            const duration = Date.now() - startTime;
            logger.info('Retrieved relevant PRDs', {
                totalPRDs: allPRDs.length,
                retrievedCount: relevantPRDs.length,
                duration: `${duration}ms`
            });
            logger.end('retrieveRelevantPRDs', { retrievedCount: relevantPRDs.length }, duration);

            return relevantPRDs;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error retrieving relevant PRDs', error, {
                duration: `${duration}ms`
            });
            logger.end('retrieveRelevantPRDs', { success: false }, duration);

            // 如果RAG检索失败，返回空数组，不影响主流程
            return [];
        }
    }

    /**
     * 从Schema中提取关键词
     */
    private extractKeywords(schema: PRDSchemaData): string {
        const keywords: string[] = [];

        if (schema.productOverview?.productName) {
            keywords.push(schema.productOverview.productName);
        }
        if (schema.productOverview?.productDescription) {
            keywords.push(schema.productOverview.productDescription);
        }
        if (schema.productOverview?.targetUsers) {
            keywords.push(...schema.productOverview.targetUsers);
        }
        if (schema.functionalRequirements) {
            schema.functionalRequirements.forEach(fr => {
                keywords.push(fr.title);
                keywords.push(fr.description);
            });
        }
        if (schema.userScenarios) {
            schema.userScenarios.forEach(us => {
                keywords.push(us.scenario);
            });
        }

        return keywords.join(' ');
    }

    /**
     * 使用AI对PRD进行相关性排序
     */
    private async rankPRDsByRelevance(
        prds: PRDRecord[],
        queryKeywords: string,
        limit: number
    ): Promise<RetrievedContext[]> {
        if (prds.length === 0) {
            return [];
        }

        // 如果PRD数量较少，直接返回
        if (prds.length <= limit) {
            return prds.map(prd => ({
                prdId: prd.prdId,
                title: prd.title,
                content: this.extractRelevantContent(prd.content, queryKeywords)
            }));
        }

        try {
            // 使用AI进行相关性评分
            const prdSummaries = prds.map(prd => ({
                prdId: prd.prdId,
                title: prd.title,
                description: prd.description || '',
                contentPreview: prd.content.substring(0, 500) // 只取前500字符用于匹配
            }));

            const response = await this.client.chat.completions.create({
                model: process.env.DEFAULT_MODEL || 'glm-4.5',
                messages: [
                    {
                        role: 'system',
                        content: `你是一个PRD检索专家。请根据查询关键词，对给定的PRD列表进行相关性评分，返回最相关的PRD ID列表。

请返回JSON格式，包含一个prdIds数组，按相关性从高到低排序。`
                    },
                    {
                        role: 'user',
                        content: `查询关键词：${queryKeywords}

PRD列表：
${JSON.stringify(prdSummaries, null, 2)}

请返回最相关的${limit}个PRD的ID列表（按相关性排序）。`
                    }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                // 如果AI调用失败，使用简单的关键词匹配
                return this.simpleKeywordMatch(prds, queryKeywords, limit);
            }

            const parsedResult = JSON.parse(content);
            const relevantPrdIds = parsedResult.prdIds || [];

            // 根据AI返回的ID顺序获取PRD
            const relevantPRDs: RetrievedContext[] = [];
            for (const prdId of relevantPrdIds) {
                const prd = prds.find(p => p.prdId === prdId);
                if (prd) {
                    relevantPRDs.push({
                        prdId: prd.prdId,
                        title: prd.title,
                        content: this.extractRelevantContent(prd.content, queryKeywords)
                    });
                }
            }

            return relevantPRDs;
        } catch (error) {
            logger.warn('AI ranking failed, using simple keyword match', error);
            // 如果AI调用失败，使用简单的关键词匹配
            return this.simpleKeywordMatch(prds, queryKeywords, limit);
        }
    }

    /**
     * 简单的关键词匹配（后备方案）
     */
    private simpleKeywordMatch(
        prds: PRDRecord[],
        queryKeywords: string,
        limit: number
    ): RetrievedContext[] {
        const keywords = queryKeywords.toLowerCase().split(/\s+/).filter(k => k.length > 1);

        const scoredPRDs = prds.map(prd => {
            const content = (prd.title + ' ' + (prd.description || '') + ' ' + prd.content).toLowerCase();
            let score = 0;

            keywords.forEach(keyword => {
                const matches = (content.match(new RegExp(keyword, 'g')) || []).length;
                score += matches;
            });

            return {
                prd,
                score
            };
        });

        // 按分数排序并取前limit个
        return scoredPRDs
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => ({
                prdId: item.prd.prdId,
                title: item.prd.title,
                content: this.extractRelevantContent(item.prd.content, queryKeywords),
                relevanceScore: item.score
            }));
    }

    /**
     * 提取PRD内容中与查询相关的部分
     */
    private extractRelevantContent(content: string, queryKeywords: string): string {
        // 如果内容较短，直接返回
        if (content.length <= 2000) {
            return content;
        }

        // 提取包含关键词的段落
        const keywords = queryKeywords.toLowerCase().split(/\s+/).filter(k => k.length > 1);
        const lines = content.split('\n');
        const relevantLines: string[] = [];
        const maxLength = 2000;

        for (const line of lines) {
            const lineLower = line.toLowerCase();
            const hasKeyword = keywords.some(keyword => lineLower.includes(keyword));

            if (hasKeyword) {
                relevantLines.push(line);
                if (relevantLines.join('\n').length >= maxLength) {
                    break;
                }
            }
        }

        // 如果找到相关行，返回它们；否则返回前2000字符
        if (relevantLines.length > 0) {
            return relevantLines.join('\n').substring(0, maxLength);
        }

        return content.substring(0, maxLength) + '...';
    }

    /**
     * 格式化检索到的上下文，用于注入到prompt中
     */
    formatContextForPrompt(contexts: RetrievedContext[]): string {
        if (contexts.length === 0) {
            return '';
        }

        let formatted = '\n\n## 参考的历史PRD文档：\n\n';

        contexts.forEach((ctx, index) => {
            formatted += `### 参考PRD ${index + 1}: ${ctx.title}\n\n`;
            formatted += `PRD ID: ${ctx.prdId}\n\n`;
            formatted += `${ctx.content}\n\n`;
            formatted += '---\n\n';
        });

        formatted += '\n请参考以上历史PRD的结构、格式和内容风格，生成新的PRD文档。';

        return formatted;
    }
}

