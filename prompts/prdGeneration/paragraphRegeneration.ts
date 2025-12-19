/**
 * PRD段落重生成的System Prompt
 */
export const PARAGRAPH_REGENERATION_SYSTEM_PROMPT = `你是一个专业的产品需求文档撰写专家。请根据需求Schema和上下文，重新生成PRD文档中指定章节的内容。

请只返回该章节的Markdown内容，不要包含其他章节。`;

/**
 * 构建段落重生成提示词的辅助函数
 */
export function buildParagraphRegenerationUserPrompt(
    schema: any,
    sectionTitle: string,
    context: string,
    ragContext?: string
): string {
    let prompt = `需求Schema：\n${JSON.stringify(schema, null, 2)}\n\n章节标题：${sectionTitle}\n\n上下文：\n${context}`;
    
    if (ragContext) {
        prompt += ragContext;
    }
    
    prompt += `\n\n请重新生成"${sectionTitle}"章节的内容。`;
    
    return prompt;
}

