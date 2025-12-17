import OpenAI from 'openai';
import { PRDSchemaData } from '../../types/prdGeneration.js';
import { createLogger } from '../../utils/logger.js';
import { RAGRetriever, RetrievedContext } from './ragRetriever.js';

const logger = createLogger('PRDGenerationAgent');

export class PRDGenerationAgent {
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
   * 根据Schema生成PRD Markdown文档
   */
  async generatePRD(
    schema: PRDSchemaData,
    template?: string,
    useRAG: boolean = true
  ): Promise<string> {
    const startTime = Date.now();
    logger.start('generatePRD', {
      hasProductOverview: !!schema.productOverview,
      functionalRequirementsCount: schema.functionalRequirements?.length || 0
    });

    try {
      // 使用RAG检索相关的历史PRD
      let ragContext = '';
      if (useRAG) {
        try {
          const relevantPRDs = await this.ragRetriever.retrieveRelevantPRDs(schema);
          if (relevantPRDs.length > 0) {
            ragContext = this.ragRetriever.formatContextForPrompt(relevantPRDs);
            logger.info('RAG context retrieved', { prdCount: relevantPRDs.length });
          }
        } catch (error) {
          logger.warn('RAG retrieval failed, continuing without context', error);
        }
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `你是一个专业的产品需求文档（PRD）撰写专家。你的任务是根据结构化的需求Schema生成一份完整、专业、可评审的PRD文档。

PRD文档应包含以下章节：
1. 产品概述
   - 产品定位
   - 产品愿景
   - 核心价值
   - 目标用户

2. 功能需求
   - 详细的功能需求描述
   - 用户故事
   - 验收标准

3. 非功能需求
   - 性能要求
   - 安全要求
   - 兼容性要求
   - 可用性要求

4. 用户场景
   - 主要使用场景
   - 用户流程

5. 技术约束和业务规则

6. 风险评估

7. 成功指标

请使用Markdown格式输出，确保文档结构清晰、内容完整、语言专业。对于不确定的信息，请明确标注"待确认"或"待补充"。

重要提示：
- 必须生成完整的PRD文档，包含所有上述章节
- 每个功能需求都要有详细的描述、用户故事和验收标准
- 内容要详细、具体，不要过于简略
- 确保文档长度足够（建议至少3000-5000字）
- 如果内容被截断，请确保至少包含前4个章节的完整内容`
        },
        {
          role: 'user',
          content: this.buildGenerationPrompt(schema, template, ragContext)
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
   * 构建PRD生成提示词
   */
  private buildGenerationPrompt(
    schema: PRDSchemaData,
    template?: string,
    ragContext?: string
  ): string {
    let prompt = `请根据以下结构化的需求Schema生成PRD文档：\n\n${JSON.stringify(schema, null, 2)}\n\n`;

    if (template) {
      prompt += `\n请参考以下模板格式：\n${template}\n\n`;
    }

    if (ragContext) {
      prompt += ragContext;
    }

    prompt += `\n\n请生成一份完整、专业的PRD文档，使用Markdown格式。

要求：
1. 必须包含所有必要的章节（产品概述、功能需求、非功能需求、用户场景、技术约束、风险评估、成功指标）
2. 每个功能需求都要详细描述，包括功能说明、用户故事、验收标准
3. 内容要具体、详细，不要过于简略
4. 文档长度建议在3000-5000字之间
5. 使用清晰的Markdown格式，包括标题、列表、表格等`;

    return prompt;
  }

  /**
   * 段落级重生成（用于前端编辑功能）
   */
  async regenerateParagraph(
    schema: PRDSchemaData,
    sectionTitle: string,
    context: string,
    useRAG: boolean = true
  ): Promise<string> {
    const startTime = Date.now();
    logger.start('regenerateParagraph', { sectionTitle });

    try {
      // 使用RAG检索相关的历史PRD（针对特定章节）
      let ragContext = '';
      if (useRAG) {
        try {
          const relevantPRDs = await this.ragRetriever.retrieveRelevantPRDs(schema, 3); // 段落重生成时使用更少的参考文档
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
          content: `你是一个专业的产品需求文档撰写专家。请根据需求Schema和上下文，重新生成PRD文档中指定章节的内容。

请只返回该章节的Markdown内容，不要包含其他章节。`
        },
        {
          role: 'user',
          content: `需求Schema：\n${JSON.stringify(schema, null, 2)}\n\n章节标题：${sectionTitle}\n\n上下文：\n${context}${ragContext}\n\n请重新生成"${sectionTitle}"章节的内容。`
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

