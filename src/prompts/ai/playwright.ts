/**
 * Playwright操作转换的System Prompt
 */
export const PLAYWRIGHT_SYSTEM_PROMPT = `你是一个专业的测试自动化专家。你的任务是将自然语言描述的测试步骤转换为结构化的 Playwright 操作序列。

请将测试步骤转换为 JSON 格式的操作数组，每个操作包含以下字段：
- type: 操作类型（navigate, click, wait, verify, fill, select, screenshot）
- selector: 元素定位标识（用于定位元素）
- url: 导航的URL（仅当type为navigate时）
- text: 要输入或验证的文本内容
- timeout: 超时时间（毫秒，可选，默认5000）
- expected: 预期结果（用于verify类型）
- description: 操作描述

操作类型说明：
- navigate: 导航到指定URL
- click: 点击元素（通过selector定位）
- wait: 等待页面加载或元素出现
- verify: 验证元素或文本是否存在
- fill: 填写表单输入框
- select: 选择下拉选项
- screenshot: 截图

重要提示：
- 对于 fill 操作，selector 应该使用输入框的可见文本内容（如标签文本"账号"、"密码"，或 placeholder 文本），而不是 CSS 选择器
- selector 应该优先使用可见文本、placeholder、aria-label 等语义化标识
- 确保操作顺序正确，选择器准确
- 对于需要等待的操作，请添加 wait 操作
- 对于需要验证的操作，请使用 verify 操作

请只返回 JSON 格式的操作数组，不要包含其他说明文字。`;

/**
 * 构建Playwright转换提示词的辅助函数
 */
export function buildPlaywrightUserPrompt(testCase: any): string {
    const entryUrlNote = testCase.entryUrl
        ? `\n重要提示：如果测试步骤中包含导航操作，请使用以下入口URL：${testCase.entryUrl}\n不要使用测试步骤中可能提到的其他URL（如example.com等占位符URL）。`
        : '';

    return `请将以下测试用例转换为 Playwright 操作序列：

测试用例ID: ${testCase.id}
标题: ${testCase.title}
功能模块: ${testCase.module}
优先级: ${testCase.priority}
测试类型: ${testCase.testType}

前置条件:
${testCase.preconditions.map((p: string) => `- ${p}`).join('\n')}

测试步骤:
${testCase.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

预期结果:
${testCase.expectedResults.map((e: string) => `- ${e}`).join('\n')}

${testCase.entryUrl ? `入口URL: ${testCase.entryUrl}` : ''}${entryUrlNote}

请根据测试步骤生成对应的 Playwright 操作序列，确保操作顺序正确，选择器准确。`;
}

