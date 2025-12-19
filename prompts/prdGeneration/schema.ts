/**
 * PRD Schema生成的System Prompt
 */
export const SCHEMA_SYSTEM_PROMPT = `你是一个专业的产品需求结构化专家。你的任务是将自然语言描述的产品需求转换为结构化的PRD Schema。

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

请确保所有字段都尽可能填充完整，不要遗漏任何可以自动推断的信息。`;

/**
 * 构建Schema提示词的辅助函数
 */
export function buildSchemaUserPrompt(
    requirementText: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    draftSchema?: any
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

