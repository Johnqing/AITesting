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

## 重要要求：自动填充所有可推断的信息

### 必须填充的字段：
1. **非功能需求**：根据产品类型和功能自动生成合理的性能、安全、兼容性、可用性要求
   - Web应用：响应时间、并发支持、浏览器兼容性等
   - 移动App：启动速度、内存占用、iOS/Android兼容性等
   - 小程序：加载速度、包大小限制等

2. **用户场景**：根据功能需求自动生成2-5个典型使用场景，包含完整的步骤和预期结果

3. **技术约束**：根据产品类型自动推断（如Web应用需要考虑浏览器兼容性、移动App需要考虑平台限制等）

4. **业务规则**：根据功能描述自动推断合理的业务规则

5. **验收标准**：为每个功能需求自动生成2-3条具体的验收标准

6. **用户故事**：为每个功能需求自动生成标准的用户故事格式

### 填充原则：
- 即使需求中没有明确说明，也要根据产品类型和行业最佳实践自动填充
- 对于不确定的内容，提供合理的默认值，而不是留空
- 确保所有字段都有内容，不要返回空数组或空对象（除非确实不适用）

请确保所有字段都尽可能填充完整，不要遗漏任何可以自动推断的信息。`
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
      prompt += '\n## 对话历史：\n';
      conversationHistory.forEach((msg) => {
        prompt += `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    if (draftSchema) {
      prompt += `\n## 已有部分结构化信息（请在此基础上补充和完善）：\n${JSON.stringify(draftSchema, null, 2)}\n\n`;
      prompt += `**重要**：请充分利用已有信息，并自动补充以下缺失的字段：\n`;
      prompt += `- 如果非功能需求为空，请根据产品类型自动生成\n`;
      prompt += `- 如果用户场景为空，请根据功能需求自动生成2-5个典型场景\n`;
      prompt += `- 如果技术约束为空，请根据产品类型自动推断\n`;
      prompt += `- 如果业务规则为空，请根据功能描述自动推断\n`;
      prompt += `- 为每个功能需求补充用户故事和验收标准（如果缺失）\n\n`;
    } else {
      prompt += `\n## 自动填充要求：\n`;
      prompt += `请根据需求文本自动推断并填充所有字段，包括：\n`;
      prompt += `- 非功能需求（性能、安全、兼容性、可用性）\n`;
      prompt += `- 用户场景（2-5个典型场景）\n`;
      prompt += `- 技术约束（根据产品类型）\n`;
      prompt += `- 业务规则（根据功能描述）\n`;
      prompt += `- 每个功能的用户故事和验收标准\n\n`;
    }

    prompt += `**确保返回的Schema完整，所有字段都有内容，不要返回空数组或空对象。**\n`;

    return prompt;
  }
}

