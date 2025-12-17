import OpenAI from 'openai';
import { PRDSchemaData } from '../../types/prdGeneration.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('SchemaAgent');

export class SchemaAgent {
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
   * 将自然语言需求转换为结构化Schema
   */
  async structureToSchema(
    requirementText: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    draftSchema?: Partial<PRDSchemaData>
  ): Promise<PRDSchemaData> {
    const startTime = Date.now();
    logger.start('structureToSchema', {
      requirementLength: requirementText.length,
      hasDraft: !!draftSchema
    });

    try {
      logger.info('Calling AI for schema structuring', {
        requirementLength: requirementText.length,
        conversationHistoryLength: conversationHistory.length,
        hasDraft: !!draftSchema,
        model: process.env.DEFAULT_MODEL || 'glm-4.5'
      });

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `你是一个专业的产品需求结构化专家。你的任务是将自然语言描述的产品需求转换为结构化的PRD Schema。

请返回JSON格式的Schema，包含以下结构：
{
  "productOverview": {
    "productName": "产品名称",
    "productDescription": "产品描述",
    "targetUsers": ["目标用户1", "目标用户2"],
    "coreValue": ["核心价值1", "核心价值2"]
  },
  "functionalRequirements": [
    {
      "id": "FR-001",
      "title": "功能标题",
      "description": "功能描述",
      "priority": "P0|P1|P2",
      "userStory": "用户故事",
      "acceptanceCriteria": ["验收标准1", "验收标准2"]
    }
  ],
  "nonFunctionalRequirements": {
    "performance": ["性能要求1"],
    "security": ["安全要求1"],
    "compatibility": ["兼容性要求1"],
    "usability": ["可用性要求1"]
  },
  "userScenarios": [
    {
      "scenario": "场景描述",
      "steps": ["步骤1", "步骤2"],
      "expectedResult": "预期结果"
    }
  ],
  "technicalConstraints": ["约束1", "约束2"],
  "businessRules": ["规则1", "规则2"]
}

请确保所有字段都尽可能填充完整。`
        },
        {
          role: 'user',
          content: this.buildSchemaPrompt(requirementText, conversationHistory, draftSchema)
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
      logger.info('AI schema API call completed', {
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

      logger.debug('AI schema response received', {
        contentLength: content.length,
        contentPreview: content.substring(0, 200)
      });

      // 解析JSON响应
      logger.debug('Parsing schema JSON response', { contentLength: content.length });
      let parsedResult: any;
      try {
        parsedResult = JSON.parse(content);
        logger.debug('Schema JSON parsed successfully', {
          hasProductOverview: !!parsedResult.productOverview,
          functionalRequirementsCount: parsedResult.functionalRequirements?.length || 0,
          hasNonFunctionalRequirements: !!parsedResult.nonFunctionalRequirements
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
          logger.debug('Schema JSON parsed from code block');
        } else {
          logger.error('All JSON parsing methods failed', undefined, {
            contentPreview: content.substring(0, 500)
          });
          throw new Error(`Failed to parse AI response: ${content.substring(0, 200)}`);
        }
      }

      // 合并draftSchema（如果提供）
      logger.debug('Merging draft schema if provided', { hasDraft: !!draftSchema });
      const schema: PRDSchemaData = draftSchema ? { ...draftSchema, ...parsedResult } : parsedResult;

      const duration = Date.now() - startTime;
      logger.info('Schema structured', {
        hasProductOverview: !!schema.productOverview,
        functionalRequirementsCount: schema.functionalRequirements?.length || 0,
        duration: `${duration}ms`
      });
      logger.end('structureToSchema', { success: true }, duration);

      return schema;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error structuring schema', error, {
        duration: `${duration}ms`
      });
      logger.end('structureToSchema', { success: false }, duration);
      throw error;
    }
  }

  /**
   * 构建Schema提示词
   */
  private buildSchemaPrompt(
    requirementText: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    draftSchema?: Partial<PRDSchemaData>
  ): string {
    let prompt = `请将以下产品需求转换为结构化的PRD Schema：\n\n${requirementText}\n\n`;

    if (conversationHistory.length > 0) {
      prompt += '\n对话历史：\n';
      conversationHistory.forEach((msg) => {
        prompt += `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    if (draftSchema) {
      prompt += `\n已有部分结构化信息（请在此基础上补充和完善）：\n${JSON.stringify(draftSchema, null, 2)}\n\n`;
    }

    return prompt;
  }
}

