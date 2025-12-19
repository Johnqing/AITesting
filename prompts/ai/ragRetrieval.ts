/**
 * RAG检索的System Prompt
 */
export const RAG_RETRIEVAL_SYSTEM_PROMPT = `你是一个PRD检索专家。请根据查询关键词，对给定的PRD列表进行相关性评分，返回最相关的PRD ID列表。

请返回JSON格式，包含一个prdIds数组，按相关性从高到低排序。`;

/**
 * 构建RAG检索提示词的辅助函数
 */
export function buildRAGRetrievalUserPrompt(
    queryKeywords: string,
    prdSummaries: Array<{ prdId: string; title: string; description: string; contentPreview: string }>,
    limit: number
): string {
    return `查询关键词：${queryKeywords}

PRD列表：
${JSON.stringify(prdSummaries, null, 2)}

请返回最相关的${limit}个PRD的ID列表（按相关性排序）。`;
}

