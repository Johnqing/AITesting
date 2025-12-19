# Prompts 目录

本目录包含项目中所有AI提示词（Prompts）的定义。

## 目录结构

```
prompts/
├── prdGeneration/          # PRD生成相关的prompts
│   ├── clarification.ts    # 需求澄清prompt
│   ├── schema.ts           # Schema生成prompt
│   ├── generation.ts       # PRD文档生成prompt
│   └── paragraphRegeneration.ts  # 段落重生成prompt
├── testCase/               # 测试用例相关的prompts
│   ├── prdParser.ts        # PRD解析生成测试用例prompt
│   └── markdownParser.ts   # Markdown解析prompt
└── ai/                     # AI客户端相关的prompts
    ├── playwright.ts       # Playwright操作转换prompt
    └── ragRetrieval.ts     # RAG检索prompt
```

## 使用说明

每个prompt文件通常包含：
1. **System Prompt常量**：定义AI的系统角色和任务
2. **User Prompt构建函数**：根据输入参数动态构建用户提示词

### 示例

```typescript
import { CLARIFICATION_SYSTEM_PROMPT, buildClarificationUserPrompt } from '../../prompts/prdGeneration/clarification.js';

const messages = [
  {
    role: 'system',
    content: CLARIFICATION_SYSTEM_PROMPT
  },
  {
    role: 'user',
    content: buildClarificationUserPrompt(requirementText, conversationHistory, historicalContext)
  }
];
```

## 维护指南

- 所有prompt的修改都应该在这个目录中进行
- 修改prompt后，需要重新编译TypeScript代码
- 建议在修改prompt时添加注释说明修改原因
- 保持prompt的清晰性和一致性

