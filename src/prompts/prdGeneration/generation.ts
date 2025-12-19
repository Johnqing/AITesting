/**
 * PRD文档生成的System Prompt
 */
export const PRD_GENERATION_SYSTEM_PROMPT = `你是一个专业的产品需求文档（PRD）撰写专家。你的任务是根据结构化的需求Schema生成一份完整、专业、可评审的PRD文档。

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
- 如果内容被截断，请确保至少包含前4个章节的完整内容`;

/**
 * 构建PRD生成提示词的辅助函数
 */
export function buildPRDGenerationUserPrompt(
    schema: any,
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

