import { PlaywrightMcpClient } from './mcpClient.js';
import OpenAI from 'openai';

// AI配置接口
export interface LLMConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
}

export interface AIParseResult {
    success: boolean;
    steps: TestStep[];
    error?: string;
}

export interface AINextStepParseResult {
    success: boolean;
    step?: TestStep;
    remaining?: string;
    error?: string;
}

export interface TestStep {
    id: string;
    action: string;
    description: string;
    selector?: string;
    value?: string;
    url?: string;
    condition?: string;
    text?: string;
    timeout?: number;
    element?: string;
    ref?: string;
    stepType?: 'operation' | 'assertion';
    pixels?: number;
    direction?: 'up' | 'down' | 'left' | 'right';
    x?: number;
    y?: number;
    tabTarget?: string;
    tabMatchType?: 'title' | 'url' | 'index' | 'last' | 'first';
}

export interface MCPCommand {
    name: string;
    arguments: Record<string, any>;
}

/**
 * 简化版AI解析器 - 使用OpenAI API直接调用，不依赖配置管理器
 */
export class AITestParser {
    private openai: OpenAI | null = null;
    private config: LLMConfig;

    constructor(_mcpClient: PlaywrightMcpClient, llmConfig?: LLMConfig) {
        // mcpClient保留用于未来扩展

        // 使用传入的配置或从环境变量读取
        this.config = llmConfig || {
            apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
            baseUrl: process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            model: process.env.DEFAULT_MODEL || 'gpt-4o',
            temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
            maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '1500')
        };

        // 初始化OpenAI客户端
        if (this.config.apiKey) {
            // 检测是否为OpenRouter API（通过baseUrl判断）
            const isOpenRouter = this.config.baseUrl.includes('openrouter') ||
                this.config.baseUrl.includes('bigmodel.cn') ||
                process.env.OPENROUTER_API_KEY;

            const clientConfig: any = {
                apiKey: this.config.apiKey,
                baseURL: this.config.baseUrl,
            };

            // OpenRouter需要额外的HTTP headers（通过fetch选项添加）
            if (isOpenRouter) {
                clientConfig.fetch = async (url: string, init?: RequestInit) => {
                    const customHeaders: Record<string, string> = {
                        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://github.com/testflow',
                        'X-Title': process.env.OPENROUTER_TITLE || 'TestFlow AI Parser',
                    };

                    // 确保Authorization头存在
                    const existingHeaders = init?.headers || {};
                    const headers: Record<string, string> = {};

                    // 复制现有headers
                    if (existingHeaders instanceof Headers) {
                        existingHeaders.forEach((value, key) => {
                            headers[key] = value;
                        });
                    } else if (Array.isArray(existingHeaders)) {
                        existingHeaders.forEach(([key, value]) => {
                            headers[key] = value;
                        });
                    } else {
                        Object.assign(headers, existingHeaders);
                    }

                    // 确保Authorization头存在
                    if (!headers['Authorization'] && !headers['authorization']) {
                        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
                    }

                    // 添加自定义headers
                    Object.assign(headers, customHeaders);

                    return fetch(url, {
                        ...init,
                        headers,
                    });
                };
            } else {
                // 对于非OpenRouter的API，也确保Authorization头正确设置
                clientConfig.defaultHeaders = {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                };
            }

            this.openai = new OpenAI(clientConfig);

            const provider = isOpenRouter ? 'OpenRouter' : 'OpenAI';
            console.log(`🤖 AI解析器启用，提供商: ${provider}，模型: ${this.config.model}`);
            if (isOpenRouter) {
                console.log(`   - API地址: ${this.config.baseUrl}`);
            }
        } else {
            console.warn('⚠️ AI解析器未配置API Key，将使用启发式解析');
        }
    }

    /**
     * 获取当前模型信息
     */
    public getCurrentModelInfo(): { modelName: string; provider: string; mode: string } {
        const isOpenRouter = this.config.baseUrl.includes('openrouter') ||
            this.config.baseUrl.includes('bigmodel.cn') ||
            process.env.OPENROUTER_API_KEY;
        return {
            modelName: this.config.model,
            provider: isOpenRouter ? 'OpenRouter' : 'OpenAI',
            mode: '简化模式'
        };
    }

    /**
     * 检查是否使用配置管理器模式（简化版始终返回false）
     */
    public isConfigManagerMode(): boolean {
        return false;
    }

    /**
     * 重新加载配置
     */
    public async reloadConfiguration(): Promise<void> {
        console.log('⚠️ 简化版AI解析器不支持配置重新加载');
    }

    /**
     * 基于MCP快照和用例描述，AI解析为可执行的步骤
     */
    async parseTestDescription(description: string, _testName: string, _runId: string, _snapshot: any | null): Promise<AIParseResult> {
        try {
            const steps = this.splitDescriptionToSteps(description);
            return { success: true, steps };
        } catch (error: any) {
            return { success: false, steps: [], error: `解析测试描述失败: ${error.message}` };
        }
    }

    /**
     * AI根据当前快照和下一条指令生成MCP命令
     */
    async parseNextStep(remainingStepsText: string, snapshot: any | null, runId: string): Promise<AINextStepParseResult> {
        try {
            console.log(`\n🔍 [${runId}] ===== AI解析步骤开始 =====`);
            console.log(`📋 [${runId}] 剩余步骤文本:\n${remainingStepsText}`);

            if (!remainingStepsText?.trim()) {
                return { success: false, error: "没有剩余步骤" };
            }

            // 🔥 修复：过滤掉"预期结果"部分和markdown分隔符
            let filteredText = remainingStepsText;

            // 检测并移除"预期结果"部分
            const expectedResultPatterns = [
                /(\*\*)?预期结果(\*\*)?\s*:?\s*/i,
                /expected\s+result/i,
                /^---+\s*$/m,  // markdown分隔符
                /^```/m,  // 代码块开始
            ];

            // 找到"预期结果"的位置并截断
            for (const pattern of expectedResultPatterns) {
                const match = filteredText.match(pattern);
                if (match && match.index !== undefined) {
                    console.log(`⚠️ [${runId}] 检测到"预期结果"标记，截断剩余文本`);
                    filteredText = filteredText.substring(0, match.index).trim();
                    break;
                }
            }

            // 过滤掉以"- "开头的行（通常是预期结果的列表项）
            const lines = filteredText.split('\n')
                .map(line => line.trim())
                .filter(line => {
                    // 跳过空行
                    if (line.length === 0) return false;
                    // 跳过以"- "开头的行（预期结果列表项）
                    if (line.startsWith('- ')) {
                        console.log(`⚠️ [${runId}] 跳过预期结果列表项: "${line}"`);
                        return false;
                    }
                    // 跳过markdown格式的标题
                    if (line.startsWith('##') || line.startsWith('**')) {
                        console.log(`⚠️ [${runId}] 跳过markdown标题: "${line}"`);
                        return false;
                    }
                    return true;
                });

            if (lines.length === 0) {
                console.log(`✅ [${runId}] 所有步骤已解析完成，剩余内容为预期结果部分`);
                return { success: false, error: "没有剩余步骤" };
            }

            let nextStepText = lines[0].trim();
            // 🔥 修复：更严格的步骤编号匹配
            nextStepText = nextStepText.replace(/^(?:\d+\s*[、。\.\)\:]?\s*|步骤\s*\d+\s*[、。\.\)\:]?\s*)/i, '').trim();

            // 🔥 新增：验证是否是有效的操作步骤（不是预期结果）
            if (!nextStepText || nextStepText.startsWith('-') || nextStepText.startsWith('**') || nextStepText.toLowerCase().includes('预期结果')) {
                console.log(`⚠️ [${runId}] 检测到非步骤内容，停止解析: "${nextStepText}"`);
                return { success: false, error: "没有剩余步骤" };
            }

            // 🔥 新增：检测验证/断言步骤，这些不应该被解析为操作步骤
            const assertionKeywords = ['验证', '检查', '确认', '断言', '判断', '查看', '观察', 'verify', 'check', 'assert', 'validate'];
            const isAssertionStep = assertionKeywords.some(keyword => nextStepText.includes(keyword));
            if (isAssertionStep) {
                console.log(`ℹ️ [${runId}] 检测到验证/断言步骤，跳过执行: "${nextStepText}"`);
                console.log(`ℹ️ [${runId}] 验证步骤通常用于预期结果验证，不需要执行操作`);
                // 跳过这个步骤，继续解析下一个
                const remaining = lines.slice(1).join('\n').trim();
                if (remaining.trim()) {
                    // 如果还有剩余步骤，递归解析下一个
                    return this.parseNextStep(remaining, snapshot, runId);
                } else {
                    return { success: false, error: "没有剩余步骤" };
                }
            }

            const remaining = lines.slice(1).join('\n').trim();

            console.log(`🎯 [${runId}] 当前解析步骤: "${nextStepText}"`);

            // 生成MCP命令
            const mcpCommand = await this.generateMCPCommand(nextStepText, snapshot, runId);

            const step: TestStep = {
                id: `step-${Date.now()}`,
                action: mcpCommand.name,
                description: nextStepText,
                stepType: 'operation',
                ...mcpCommand.arguments
            };

            // 🔥 修复：验证解析后的命令格式
            const validationError = this.validateParsedStep(step, runId);
            if (validationError) {
                console.error(`❌ [${runId}] AI解析的命令格式验证失败: ${validationError}`);
                // 尝试使用启发式算法重新解析
                console.log(`⚠️ [${runId}] 尝试使用启发式算法重新解析...`);
                const heuristicCommand = this.generateMCPCommandHeuristic(nextStepText);
                const heuristicStep: TestStep = {
                    id: `step-${Date.now()}`,
                    action: heuristicCommand.name,
                    description: nextStepText,
                    stepType: 'operation',
                    ...heuristicCommand.arguments
                };
                console.log(`✅ [${runId}] 启发式算法解析完成: ${heuristicStep.action} - ${heuristicStep.description}`);
                return { success: true, step: heuristicStep, remaining: remaining || '' };
            }

            // 🔥 新增：确保步骤参数完整，特别是ref和element参数
            const actionStr = String(step.action);
            if ((actionStr === 'browser_click' || actionStr === 'browser_type') && !(step as any).ref && !(step as any).element) {
                // 如果缺少ref和element，尝试从description中提取或使用description作为fallback
                console.warn(`⚠️ [${runId}] 步骤缺少ref和element参数，使用description作为fallback`);
                (step as any).element = nextStepText;
            }

            // 🔥 新增：记录解析后的步骤详细信息，便于调试
            const stepDetails: any = {
                action: step.action,
                description: step.description,
                ref: (step as any).ref,
                element: (step as any).element,
                selector: step.selector,
                text: (step as any).text,
                url: step.url
            };

            // 🔥 新增：检查关键参数是否缺失
            if ((actionStr === 'browser_click' || actionStr === 'browser_type') && !(step as any).ref) {
                console.warn(`⚠️ [${runId}] AI解析的步骤缺少ref参数:`, stepDetails);
                if (!(step as any).element && !step.selector) {
                    console.error(`❌ [${runId}] 步骤既缺少ref也缺少element/selector，可能导致执行失败`);
                } else {
                    console.log(`ℹ️ [${runId}] 将尝试通过element/selector查找ref: ${(step as any).element || step.selector}`);
                }
            }

            console.log(`📋 [${runId}] 解析后的步骤详情:`, JSON.stringify(stepDetails, null, 2));
            console.log(`✅ [${runId}] AI解析步骤完成: ${step.action} - ${step.description}`);
            return { success: true, step, remaining: remaining || '' };
        } catch (error: any) {
            console.error(`❌ [${runId}] AI解析步骤失败: ${error}`);
            return { success: false, error: `解析下一步骤失败: ${error.message}` };
        }
    }

    /**
     * AI根据快照和断言描述生成断言命令
     */
    async parseAssertions(assertionsText: string, snapshot: any, runId: string): Promise<AIParseResult> {
        try {
            if (!assertionsText?.trim()) {
                return { success: true, steps: [] };
            }

            const assertionLines = assertionsText.split('\n').filter(line => line.trim());
            const steps: TestStep[] = [];

            for (let i = 0; i < assertionLines.length; i++) {
                const assertionText = assertionLines[i].trim();
                const mcpCommand = await this.generateAssertionCommand(assertionText, snapshot, runId);

                steps.push({
                    id: `assertion-${i + 1}`,
                    action: mcpCommand.name,
                    description: assertionText,
                    stepType: 'assertion',
                    ...mcpCommand.arguments
                });
            }

            return { success: true, steps };
        } catch (error: any) {
            return { success: false, steps: [], error: `解析断言失败: ${error.message}` };
        }
    }

    /**
     * 将用例描述分割为步骤
     */
    private splitDescriptionToSteps(description: string): TestStep[] {
        if (!description?.trim()) return [];

        const lines = description.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        return lines.map((line, index) => ({
            id: `step-${index + 1}`,
            action: 'pending',
            description: line,
            order: index + 1
        }));
    }

    /**
     * 🔥 真正的AI解析：根据步骤描述和快照生成MCP命令（参考sakura-ai实现）
     */
    private async generateMCPCommand(stepDescription: string, snapshot: any | null, runId: string): Promise<MCPCommand> {
        console.log(`🤖 [${runId}] 使用AI解析操作: "${stepDescription}"`);

        try {
            // 🔥 新增：预处理页签切换指令
            const tabSwitchCommand = this.detectTabSwitchCommand(stepDescription);
            if (tabSwitchCommand) {
                console.log(`✅ [${runId}] 识别为页签切换指令: ${tabSwitchCommand.name}`);
                return tabSwitchCommand;
            }

            // 如果AI客户端未配置或快照不可用，回退到启发式算法
            if (!this.openai) {
                console.log(`⚠️ [${runId}] AI客户端未配置，使用启发式算法`);
                return this.generateMCPCommandHeuristic(stepDescription);
            }

            if (!snapshot) {
                console.log(`⚠️ [${runId}] 快照不可用，使用启发式算法`);
                return this.generateMCPCommandHeuristic(stepDescription);
            }

            // 1. 过滤快照中的错误
            const filteredSnapshot = this.filterSnapshotErrors(snapshot);

            // 2. 提取页面元素
            const pageElements = this.extractPageElements(filteredSnapshot);
            console.log(`📋 [${runId}] 提取到 ${pageElements.length} 个页面元素`);

            // 🔥 新增：对于菜单项点击，显示相关的button/link元素
            if (stepDescription.includes('菜单') || stepDescription.includes('测试')) {
                const menuElements = pageElements.filter(el =>
                    (el.role === 'button' || el.role === 'link') &&
                    (el.text.includes('测试') || el.text.includes('菜单'))
                );
                console.log(`🔍 [${runId}] 菜单相关元素 (${menuElements.length}个):`,
                    menuElements.map(el => `[ref=${el.ref}] ${el.role} "${el.text}"`).join(', '));
            }

            // 3. 构建操作专用的用户提示词
            const userPrompt = this.buildOperationUserPrompt(stepDescription, pageElements);

            // 4. 调用AI模型（操作模式）
            const aiResponse = await this.callLLM(userPrompt, 'operation', runId);

            // 5. 解析AI响应
            const mcpCommand = this.parseAIResponse(aiResponse, runId);

            console.log(`✅ [${runId}] AI操作解析成功: ${mcpCommand.name}`);
            // 🔥 新增：显示解析后的ref值
            if (mcpCommand.arguments.ref) {
                console.log(`🎯 [${runId}] AI返回的ref: ${mcpCommand.arguments.ref}`);
            } else if (mcpCommand.name === 'browser_click' || mcpCommand.name === 'click') {
                console.warn(`⚠️ [${runId}] AI未返回ref，将在执行时通过快照查找`);
            }
            return mcpCommand;

        } catch (error: any) {
            console.error(`❌ [${runId}] AI操作解析失败: ${error.message}`);
            // 回退到启发式算法
            console.log(`⚠️ [${runId}] 回退到启发式算法`);
            return this.generateMCPCommandHeuristic(stepDescription);
        }
    }

    /**
     * 🔥 新增：检测页签切换指令
     */
    private detectTabSwitchCommand(stepDescription: string): MCPCommand | null {
        const text = stepDescription.toLowerCase().trim();

        // 页签切换模式匹配
        const patterns = [
            // 切换到最后一个页签
            {
                regex: /切换到最后一?个?页签|切换页签到最后|打开最后一?个?页签|最后一?个?页签/,
                type: 'last'
            },
            // 切换到第一个页签
            {
                regex: /切换到第一个页签|切换页签到第一|打开第一个页签|第一个页签/,
                type: 'first'
            },
            // 切换到新页签/新开的页签
            {
                regex: /切换到新页签|切换到新开的?页签|打开新页签|新页签/,
                type: 'last'  // 通常新页签是最后一个
            },
            // 切换到指定索引的页签（如：切换到第2个页签）
            {
                regex: /切换到第(\d+)个页签|切换页签到第(\d+)|打开第(\d+)个页签/,
                type: 'index'
            },
            // 切换到包含特定标题的页签
            {
                regex: /切换到(.+?)页签|切换页签到(.+)|打开(.+?)页签/,
                type: 'title'
            }
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern.regex);
            if (match) {
                console.log(`[AIParser] 🎯 匹配页签切换模式: ${pattern.type}, 原文: "${stepDescription}"`);

                switch (pattern.type) {
                    case 'last':
                        return {
                            name: 'browser_tab_switch',
                            arguments: {
                                tabTarget: 'last',
                                tabMatchType: 'last',
                                description: stepDescription
                            }
                        };

                    case 'first':
                        return {
                            name: 'browser_tab_switch',
                            arguments: {
                                tabTarget: 'first',
                                tabMatchType: 'first',
                                description: stepDescription
                            }
                        };

                    case 'index':
                        const indexMatch = match[1] || match[2] || match[3];
                        return {
                            name: 'browser_tab_switch',
                            arguments: {
                                tabTarget: indexMatch,
                                tabMatchType: 'index',
                                description: stepDescription
                            }
                        };

                    case 'title':
                        // 提取页签标题
                        let titleTarget = match[1] || match[2] || match[3];
                        if (titleTarget) {
                            // 清理可能的干扰词
                            titleTarget = titleTarget.replace(/(的|到|个|页签)$/, '').trim();
                            return {
                                name: 'browser_tab_switch',
                                arguments: {
                                    tabTarget: titleTarget,
                                    tabMatchType: 'title',
                                    description: stepDescription
                                }
                            };
                        }
                        break;
                }
            }
        }

        return null;  // 不是页签切换指令
    }

    /**
     * 🔥 提取页面元素用于AI分析
     * 支持原始MCP响应对象和字符串格式
     */
    private extractPageElements(snapshot: any): Array<{ ref: string, role: string, text: string }> {
        if (!snapshot) return [];

        // 如果是原始MCP响应对象，先提取字符串
        let snapshotString: string | null = null;

        if (typeof snapshot === 'string') {
            snapshotString = snapshot;
        } else if (snapshot && typeof snapshot === 'object') {
            // 从原始MCP响应中提取字符串
            if (snapshot?.snapshot?.body) {
                snapshotString = String(snapshot.snapshot.body);
            } else if (snapshot?.snapshot) {
                snapshotString = String(snapshot.snapshot);
            } else if (snapshot?.content?.[0]?.text) {
                snapshotString = String(snapshot.content[0].text);
            } else if (snapshot?.content?.text) {
                snapshotString = String(snapshot.content.text);
            }
        }

        if (!snapshotString) return [];

        const elements: Array<{ ref: string, role: string, text: string }> = [];
        const lines = snapshotString.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);

            if (refMatch) {
                const ref = refMatch[1];
                const textMatches = trimmedLine.match(/"([^"]*)"/g) || [];
                const texts = textMatches.map(t => t.replace(/"/g, ''));

                let role = '';
                if (trimmedLine.includes('textbox')) role = 'textbox';
                else if (trimmedLine.includes('button')) role = 'button';
                else if (trimmedLine.includes('link')) role = 'link';
                else if (trimmedLine.includes('checkbox')) role = 'checkbox';
                else if (trimmedLine.includes('combobox')) role = 'combobox';
                else if (trimmedLine.includes('listitem')) role = 'listitem';
                else role = 'element';

                if (ref && texts.length > 0) {
                    elements.push({ ref, role, text: texts[0] || '' });
                }
            }
        }

        return elements.slice(0, 100); // 限制前100个元素
    }

    /**
     * 🔥 获取操作模式的系统提示词
     */
    private getOperationSystemPrompt(): string {
        return `你是一个顶级的测试自动化AI专家。你的核心职责是：

# 身份与能力
- 将自然语言操作指令转换为精确的JSON格式MCP命令
- 基于页面元素快照进行智能元素定位和操作解析
- 专注于处理明确的用户操作指令（点击、输入、滚动等）

# 操作模式原则
- 你处于【操作模式】，只处理明确的操作指令
- 如果指令看起来像断言或验证，请返回错误信息
- 只有具体的操作指令才应该被转换为MCP命令

# 核心参数规则
- element参数：必须是简洁的中文描述（如"用户名输入框"、"提交按钮"）
- ref参数：必须使用页面元素列表中的确切ref值
- 两个参数都是必需的，缺一不可
- ElementUI下拉组件：包含"el-input__inner"的readonly输入框是下拉触发器

# ⚠️ 输入操作严格规则（关键）
- **text参数必须从用户指令中提取**，绝不能使用页面元素中显示的任何文本
- **禁止使用**：页面元素的placeholder、label、已有值、提示文本等任何显示内容
- **必须使用**：用户指令中明确指定的输入内容
- **示例**：
  - ✅ 指令"在用户名输入框输入admin" → text: "admin"（从指令提取）
  - ❌ 指令"在用户名输入框输入" → 不能使用页面placeholder"请输入用户名"作为text值
  - ❌ 指令"输入用户名" → 如果指令中没有具体值，text应为空字符串""或返回错误
- **如果指令中没有明确指定输入内容**：text参数应设置为空字符串""，或返回错误提示

# 下拉操作策略
- 打开下拉（包含"点击"、"展开"关键词）：点击readonly输入框触发器
- 选择下拉选项（包含"选择"、"选中"关键词）：点击已展开的listitem选项
- 关键区别：操作意图词汇决定目标元素类型

# 输出格式要求
<THOUGHTS>
1. 分析操作意图：检查是否包含"选择"、"选中"等选择关键词，还是"点击"、"展开"等打开关键词
2. 定位匹配的页面元素：选择操作应找listitem元素，打开操作应找textbox元素
3. 判断操作类型：根据操作意图和元素类型选择对应命令
4. 生成element描述和ref参数
5. 处理变量（如果需要）
6. 构建对应的MCP命令
</THOUGHTS>
<COMMAND>
{
  "name": "命令名称",
  "args": {...}
}
</COMMAND>

# 支持的MCP操作命令
## 核心交互
- 点击: {"name": "browser_click", "args": {"element": "元素描述", "ref": "element_ref", "doubleClick": false, "button": "left", "modifiers": []}}
- 双击: {"name": "browser_click", "args": {"element": "元素描述", "ref": "element_ref", "doubleClick": true}}
- 悬停: {"name": "browser_hover", "args": {"element": "元素描述", "ref": "element_ref"}}
- 输入: {"name": "browser_type", "args": {"element": "输入框描述", "ref": "input_ref", "text": "content", "submit": false, "slowly": false}}
- 选择下拉选项: {"name": "browser_select_option", "args": {"element": "下拉框描述", "ref": "select_ref", "values": ["option_value"]}}
- ElementUI下拉操作：
  - 打开下拉（"点击下拉栏"）：点击readonly textbox触发器
  - 选择选项（"选择XXX"）：点击展开的listitem选项
  - 元素识别：textbox=触发器，listitem=选项
  - 不要对自定义下拉使用browser_select_option
- 按键: {"name": "browser_press_key", "args": {"key": "Enter"}}
- 拖拽: {"name": "browser_drag", "args": {"startElement": "源元素描述", "startRef": "source_ref", "endElement": "目标元素描述", "endRef": "target_ref"}}
- 填充表单: {"name": "browser_fill_form", "args": {"fields": [{"element": "字段描述", "ref": "field_ref", "value": "值"}]}}

## 页面控制
- 导航: {"name": "browser_navigate", "args": {"url": "URL"}}
- 后退: {"name": "browser_navigate_back", "args": {}}
- 关闭页面: {"name": "browser_close", "args": {}}
- 调整窗口大小: {"name": "browser_resize", "args": {"width": 1920, "height": 1080}}

## 文件操作
- 上传文件: {"name": "browser_file_upload", "args": {"paths": ["/path/to/file"]}}

## 对话框处理
- 处理对话框: {"name": "browser_handle_dialog", "args": {"accept": true, "promptText": "提示文本（可选）"}}

## JavaScript执行
- 执行JavaScript: {"name": "browser_evaluate", "args": {"function": "() => { /* code */ }", "element": "元素描述（可选）", "ref": "element_ref（可选）"}}
- 运行Playwright代码: {"name": "browser_run_code", "args": {"code": "await page.getByRole('button').click();"}}

## 等待和同步
- 等待: {"name": "browser_wait_for", "args": {"time": 5, "text": "等待文本（可选）", "textGone": "等待消失的文本（可选）"}}

## 截图和快照
- 截图: {"name": "browser_take_screenshot", "args": {"type": "png", "filename": "screenshot.png", "fullPage": false, "element": "元素描述（可选）", "ref": "element_ref（可选）"}}
- 页面快照: {"name": "browser_snapshot", "args": {}} (只读，用于获取页面状态)

## 信息获取（只读工具）
- 获取控制台消息: {"name": "browser_console_messages", "args": {"level": "info"}}
- 获取网络请求: {"name": "browser_network_requests", "args": {"includeStatic": false}}`;
    }

    /**
     * 🔥 构建操作模式的用户提示词
     */
    private buildOperationUserPrompt(stepDescription: string, pageElements: Array<{ ref: string, role: string, text: string }>): string {
        const elementsContext = pageElements.length > 0
            ? pageElements.map(el => `[ref=${el.ref}] ${el.role} "${el.text}"`).join('\n')
            : "当前页面没有可用的交互元素。";

        return `# 当前任务：操作模式

## 当前页面可用元素
${elementsContext}

## 用户操作指令
"${stepDescription}"

## 分析要求
请将上述操作指令转换为MCP命令：
1. 确认这是一个明确的操作指令（而非断言验证）
2. **⚠️ 输入操作严格规则（关键）**：
   - **text参数必须从用户指令中提取**，绝不能使用页面元素中显示的任何文本
   - **禁止使用**：页面元素的placeholder、label、已有值、提示文本等任何显示内容
   - **必须使用**：用户指令中明确指定的输入内容
   - **如果指令中没有明确指定输入内容**：text参数应设置为空字符串""
   - 示例：
     * ✅ "在用户名输入框输入admin" → text: "admin"（从指令提取）
     * ❌ "在用户名输入框输入" → 不能使用页面placeholder"请输入用户名"，text应为""
     * ❌ "输入用户名" → 如果指令中没有具体值，text应为""
3. **🔥 菜单项点击识别规则（重要）**：
   - 如果指令包含"菜单"、"底部菜单"、"导航栏"等关键词 → 优先查找button或link类型的元素
   - 如果指令包含具体菜单项名称（如"测试"、"首页"等） → 必须找到文本完全匹配或包含该名称的元素
   - 位置描述优先级：底部菜单 > 顶部菜单 > 侧边栏 > 其他位置
   - 示例：
     * "点击底部菜单中的'测试'选项" → 查找button或link，文本包含"测试"，优先考虑位置靠下的元素
     * "点击导航栏的'首页'" → 查找button或link，文本包含"首页"
4. **必须严格执行的下拉选择判定**：
   - 如果指令包含"选择"、"选中"关键词 → **必须**点击listitem选项元素，**绝不**点击textbox
   - 如果指令包含"点击"、"展开"关键词且无"选择" → 点击textbox触发器元素
   - 示例：
     * "下拉栏选择生鲜" → 点击listitem[生鲜]，不是textbox
     * "点击下拉栏" → 点击textbox触发器
5. **强制元素类型匹配**：
   - 选择操作：必须使用listitem元素的ref
   - 打开操作：必须使用textbox元素的ref
   - 菜单项点击：优先使用button或link元素的ref
6. **元素匹配优先级**：
   - 文本完全匹配 > 文本包含匹配 > 部分匹配
   - 位置描述匹配（底部/顶部）> 无位置描述
   - 元素类型匹配（button/link用于菜单）> 其他类型
7. **🔥 关键要求：必须返回ref参数**：
   - **ref参数是必需的**，必须从页面元素列表中找到匹配元素的ref值
   - 如果找不到完全匹配的元素，选择最接近的元素（文本包含目标关键词）
   - 对于菜单项，优先查找button或link类型且文本包含目标关键词的元素
   - **禁止**：只返回element描述而不返回ref，ref必须存在
   - 示例：
     * ✅ 正确：{"name": "browser_click", "args": {"element": "测试菜单项", "ref": "e123"}}
     * ❌ 错误：{"name": "browser_click", "args": {"element": "点击底部菜单中的测试选项"}}（缺少ref）
8. 在页面元素中找到最匹配的目标元素（严格按元素类型和位置）
9. 生成简洁的中文element描述和**准确的ref参数**（必须从元素列表中提取）

请开始分析：`;
    }

    /**
     * 🔥 调用AI模型（简化版，不使用配置管理器）
     */
    private async callLLM(userPrompt: string, mode: 'operation' | 'assertion' | 'relevance_check' | 'update_generation' = 'operation', runId?: string): Promise<string> {
        if (!this.openai) {
            throw new Error('OpenAI客户端未初始化');
        }

        const runIdTag = runId ? `[AIParser ${runId}]` : '[AIParser]';
        console.log(`${runIdTag} 🚀 调用AI模型 (${mode}模式)`);
        console.log(`${runIdTag} 模型配置:`, {
            model: this.config.model,
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens
        });

        try {
            const systemPrompt = this.getSystemPromptByMode(mode);

            // 为AI调用添加超时保护（60秒）
            const response = await Promise.race([
                this.openai.chat.completions.create({
                    model: this.config.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: this.config.temperature,
                    max_tokens: this.config.maxTokens,
                }),
                new Promise<any>((_, reject) =>
                    setTimeout(() => reject(new Error('AI调用超时(60秒)')), 60000)
                )
            ]);

            const content = response.choices[0]?.message?.content;
            if (!content || content.trim() === '') {
                throw new Error('AI返回空响应');
            }

            console.log(`${runIdTag} 🤖 AI响应 (${mode}模式): ${content.substring(0, 200)}...`);
            return content;

        } catch (error: any) {
            console.error(`${runIdTag} ❌ AI调用失败 (${mode}模式)`);
            console.error(`${runIdTag} 错误详情:`, {
                message: error.message,
                name: error.name
            });

            // 增强错误信息
            if (error.message?.includes('401')) {
                console.error(`${runIdTag} 💡 建议: 请检查API密钥是否有效`);
            } else if (error.message?.includes('429')) {
                console.error(`${runIdTag} 💡 建议: API调用频率超限，请稍后重试`);
            } else if (error.message?.includes('fetch') || error.message?.includes('network')) {
                console.error(`${runIdTag} 💡 建议: 请检查网络连接`);
            }

            throw error;
        }
    }

    /**
     * 🔥 根据模式获取系统提示词
     */
    private getSystemPromptByMode(mode: 'operation' | 'assertion' | 'relevance_check' | 'update_generation'): string {
        switch (mode) {
            case 'operation':
                return this.getOperationSystemPrompt();
            case 'assertion':
                return '你是一个测试断言验证AI专家，专门生成MCP验证命令。';
            case 'relevance_check':
                return this.getRelevanceCheckSystemPrompt();
            case 'update_generation':
                return this.getUpdateGenerationSystemPrompt();
            default:
                return this.getOperationSystemPrompt();
        }
    }

    /**
     * 🔥 获取相关性检查的系统提示词
     */
    private getRelevanceCheckSystemPrompt(): string {
        return `你是一个专业的测试用例相关性分析AI专家。你的核心职责是：

# 身份与能力
- 精确分析测试用例与变更描述之间的相关性
- 基于功能、操作、UI元素、业务流程等多维度进行关联性判断
- 提供可信的相关性评分和详细的分析理由

# 分析原则
- **语义理解优先**：理解变更的实际业务含义，而不仅仅是关键词匹配
- **多维度评估**：从功能、操作、UI元素、业务流程等角度综合分析
- **细粒度判断**：即使是间接相关的情况也要准确识别和评分
- **准确性优先**：宁可保守评估，确保相关性判断的准确性

# 评分标准
- **0.9-1.0**: 直接相关，测试用例明确覆盖变更内容
- **0.7-0.8**: 高度相关，测试用例涉及变更影响的主要功能  
- **0.5-0.6**: 中度相关，测试用例可能受变更间接影响
- **0.3-0.4**: 低度相关，测试用例与变更有轻微关联
- **0.0-0.2**: 不相关，测试用例与变更无明显关联

# 输出要求
- 必须输出标准的JSON格式
- is_relevant字段：当相关性评分≥0.3时为true，否则为false
- relevance_score字段：0.0到1.0之间的数值
- recall_reason字段：详细说明相关性分析的依据和理由`;
    }

    /**
     * 🔥 获取更新生成的系统提示词
     */
    private getUpdateGenerationSystemPrompt(): string {
        return `你是一个专业的测试用例更新AI专家。你的核心职责是：

# 身份与能力
- 基于变更描述生成精确的测试用例更新方案
- 使用JSON Patch格式提供结构化的修改建议
- 评估更新可能带来的副作用和风险

# 更新原则
- **精确性优先**：只修改真正需要更新的部分，保持其他内容不变
- **最小化影响**：尽量使用replace操作而非remove+add
- **保持一致性**：确保更新后的用例格式和风格保持一致
- **风险评估**：识别并标注可能的副作用和风险等级

# JSON Patch格式
- replace: 替换现有字段的值
- add: 添加新字段或数组元素
- remove: 删除字段或数组元素

# 输出要求
- 必须输出标准的JSON格式
- reasoning字段：详细的修改理由和分析过程
- patch字段：JSON Patch操作数组
- side_effects字段：副作用描述数组
- risk_level字段：风险等级（low/medium/high）`;
    }

    /**
     * 🔥 解析AI响应为MCP命令 (支持V3格式)
     */
    private parseAIResponse(aiResponse: string, runId: string): MCPCommand {
        try {
            console.log(`[AIParser ${runId}] 🔍 开始解析AI响应: ${aiResponse.substring(0, 200)}...`);

            let jsonText = aiResponse.trim();

            // 🔥 检查是否包含错误信息（在<THOUGHTS>或其他地方）
            if (jsonText.includes('<ERROR>') || jsonText.includes('用户指令不是具体的操作指令')) {
                // 提取错误信息
                const errorMatch = jsonText.match(/<ERROR>(.*?)<\/ERROR>/s) ||
                    jsonText.match(/用户指令不是具体的操作指令[，。]?(.*)$/s);
                const errorMsg = errorMatch ? errorMatch[1].trim() : '用户指令不是具体的操作指令';
                console.log(`[AIParser ${runId}] ⚠️ AI返回错误信息: ${errorMsg}`);
                throw new Error(`AI解析失败: ${errorMsg}`);
            }

            // 🔥 V3格式: 尝试提取<COMMAND>标签中的内容
            const commandMatch = jsonText.match(/<COMMAND>\s*([\s\S]*?)\s*<\/COMMAND>/i);
            if (commandMatch) {
                jsonText = commandMatch[1].trim();
                console.log(`[AIParser ${runId}] ✅ 从<COMMAND>标签中提取JSON: ${jsonText.substring(0, 200)}`);
            } else {
                // 🔥 兼容旧格式: 如果响应包含代码块，提取其中的JSON
                const codeBlockMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
                if (codeBlockMatch) {
                    jsonText = codeBlockMatch[1].trim();
                    console.log(`[AIParser ${runId}] ✅ 从代码块中提取JSON: ${jsonText.substring(0, 200)}`);
                } else {
                    // 🔥 兼容旧格式: 尝试提取JSON对象
                    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        jsonText = jsonMatch[0];
                        console.log(`[AIParser ${runId}] ✅ 直接提取JSON对象: ${jsonText.substring(0, 200)}`);
                    } else {
                        // 🔥 如果没有找到JSON，但包含<THOUGHTS>，说明AI没有按格式返回
                        if (jsonText.includes('<THOUGHTS>')) {
                            console.error(`[AIParser ${runId}] ❌ AI返回包含<THOUGHTS>但缺少<COMMAND>标签`);
                            throw new Error('AI响应格式错误：包含思考过程但缺少命令部分');
                        }
                    }
                }
            }

            if (!jsonText || jsonText.trim() === '') {
                throw new Error('无法从AI响应中提取有效的JSON内容');
            }

            console.log(`[AIParser ${runId}] 🔍 最终解析的JSON: ${jsonText.substring(0, 200)}`);

            // 🔥 新增：检查是否是错误响应
            if (jsonText.includes('"error"') && !jsonText.includes('"name"')) {
                const errorObj = JSON.parse(jsonText);
                if (errorObj.error) {
                    console.log(`[AIParser ${runId}] ⚠️ AI返回错误信息: ${errorObj.error}`);
                    throw new Error(`AI解析失败: ${errorObj.error}`);
                }
            }

            const parsed = JSON.parse(jsonText);

            // 验证基本结构 - 支持两种格式：args 或 arguments
            if (!parsed.name) {
                throw new Error('AI响应缺少必需的name字段');
            }

            // 支持 args 或 arguments 字段
            const commandArgs = parsed.args || parsed.arguments || {};

            console.log(`[AIParser ${runId}] ✅ AI响应解析成功: ${parsed.name}`);
            console.log(`[AIParser ${runId}] 命令参数:`, JSON.stringify(commandArgs).substring(0, 200));

            // 🔥 新增：验证点击操作必须包含ref
            if ((parsed.name === 'browser_click' || parsed.name === 'click') && !commandArgs.ref) {
                console.warn(`[AIParser ${runId}] ⚠️ 点击操作缺少ref参数，命令参数:`, JSON.stringify(commandArgs));
                // 不抛出错误，允许在执行时通过快照查找元素
                console.log(`[AIParser ${runId}] ℹ️ 将在执行时通过快照查找元素`);
            }

            return {
                name: parsed.name,
                arguments: commandArgs
            };

        } catch (error: any) {
            console.error(`[AIParser ${runId}] ❌ AI响应解析失败:`, {
                message: error.message,
                name: error.name
            });
            console.error(`[AIParser ${runId}] 📄 原始响应: ${aiResponse.substring(0, 500)}`);
            throw new Error(`AI响应解析失败: ${error.message}`);
        }
    }

    /**
     * 🔥 新增：验证解析后的步骤格式是否正确
     */
    private validateParsedStep(step: TestStep, runId: string): string | null {
        const actionStr = String(step.action || '').trim();

        if (!actionStr) {
            return '步骤缺少action字段';
        }

        // 验证不同操作类型的必需参数
        switch (actionStr) {
            case 'browser_navigate':
            case 'navigate':
                if (!step.url && !(step as any).url) {
                    return '导航操作缺少url参数';
                }
                break;

            case 'browser_click':
            case 'click':
                // 点击操作需要ref或element
                if (!(step as any).ref && !(step as any).element) {
                    // 如果没有ref和element，但description存在，可以尝试继续（会在执行时查找）
                    if (!step.description) {
                        return '点击操作缺少目标元素标识（ref/element/description）';
                    }
                }
                break;

            case 'browser_type':
            case 'type':
            case 'fill':
            case 'input':
                // 输入操作需要ref或element
                if (!(step as any).ref && !(step as any).element) {
                    if (!step.description) {
                        return '输入操作缺少目标元素标识（ref/element/description）';
                    }
                }
                // text参数可以为空字符串，但应该存在
                if ((step as any).text === undefined && (step as any).value === undefined) {
                    // 允许text为空字符串（清空操作），但不允许undefined
                    console.warn(`⚠️ [${runId}] 输入操作未指定text参数，将使用空字符串`);
                }
                break;

            default:
                // 其他操作类型暂不验证
                break;
        }

        return null; // 验证通过
    }

    /**
     * 启发式算法生成MCP命令（不依赖AI）
     */
    private generateMCPCommandHeuristic(stepDescription: string): MCPCommand {
        const text = stepDescription.toLowerCase().trim();

        // 导航操作
        if (text.includes('导航') || text.includes('打开') || text.includes('访问') || text.match(/https?:\/\//)) {
            const urlMatch = stepDescription.match(/(https?:\/\/[^\s]+)/);
            return {
                name: 'browser_navigate',
                arguments: { url: urlMatch ? urlMatch[1] : stepDescription }
            };
        }

        // 点击操作
        if (text.includes('点击') || text.includes('单击') || text.includes('按')) {
            return {
                name: 'browser_click',
                arguments: { selector: stepDescription }
            };
        }

        // 输入操作
        if (text.includes('输入') || text.includes('填写') || text.includes('输入框')) {
            const parts = stepDescription.split(/输入|填写/);
            const value = parts[1]?.trim() || '';
            return {
                name: 'browser_type',
                arguments: { selector: parts[0]?.trim() || stepDescription, text: value }
            };
        }

        // 等待操作
        if (text.includes('等待') || text.includes('暂停')) {
            return {
                name: 'browser_wait_for',
                arguments: { state: 'networkidle', timeout: 3000 }
            };
        }

        // 默认：点击
        return {
            name: 'browser_click',
            arguments: { selector: stepDescription }
        };
    }

    /**
     * 🔥 过滤快照中的非功能性错误
     * 支持原始MCP响应对象和字符串格式
     */
    private filterSnapshotErrors(snapshot: any): any {
        // 如果是原始MCP响应对象，先提取字符串
        let snapshotString: string | null = null;

        if (typeof snapshot === 'string') {
            snapshotString = snapshot;
        } else if (snapshot && typeof snapshot === 'object') {
            // 从原始MCP响应中提取字符串
            if (snapshot?.snapshot?.body) {
                snapshotString = String(snapshot.snapshot.body);
            } else if (snapshot?.snapshot) {
                snapshotString = String(snapshot.snapshot);
            } else if (snapshot?.content?.[0]?.text) {
                snapshotString = String(snapshot.content[0].text);
            } else if (snapshot?.content?.text) {
                snapshotString = String(snapshot.content.text);
            }
        }

        if (!snapshotString) {
            // 如果无法提取字符串，返回原始对象
            return snapshot;
        }

        console.log(`🧹 开始过滤快照中的Console错误...`);

        // 统计过滤前的错误数量
        const errorCountBefore = (snapshotString.match(/TypeError:|ReferenceError:|SyntaxError:/g) || []).length;

        // 过滤常见的JavaScript错误
        let filteredSnapshot = snapshotString
            // 过滤 getComputedStyle 错误
            .replace(/- TypeError: Failed to execute 'getComputedStyle'[^\n]*/g, '')
            // 过滤 Cannot read properties 错误
            .replace(/- TypeError: Cannot read properties of undefined[^\n]*/g, '')
            // 过滤其他常见TypeError
            .replace(/- TypeError:[^\n]*/g, '')
            // 过滤 ReferenceError
            .replace(/- ReferenceError:[^\n]*/g, '')
            // 过滤 SyntaxError
            .replace(/- SyntaxError:[^\n]*/g, '')
            // 过滤错误堆栈信息
            .replace(/at [a-zA-Z]+ \(https?:\/\/[^\)]+\)[^\n]*/g, '')
            // 过滤空的 "..." 占位符
            .replace(/\.\.\.[^\n]*\n/g, '')
            // 清理多余的空行
            .replace(/\n\n+/g, '\n\n');

        // 如果 "New console messages" 部分为空,则整个移除
        filteredSnapshot = filteredSnapshot.replace(/### New console messages\n+###/g, '');

        // 统计过滤后的错误数量
        const errorCountAfter = (filteredSnapshot.match(/TypeError:|ReferenceError:|SyntaxError:/g) || []).length;
        const filteredCount = errorCountBefore - errorCountAfter;

        if (filteredCount > 0) {
            console.log(`✅ 已过滤 ${filteredCount} 个Console错误，剩余 ${errorCountAfter} 个`);
        } else {
            console.log(`ℹ️ 快照中没有发现需要过滤的Console错误`);
        }

        // 如果原始输入是对象，返回过滤后的字符串；否则返回过滤后的字符串
        return filteredSnapshot;
    }

    /**
     * 生成断言命令
     */
    private async generateAssertionCommand(assertionText: string, _snapshot: any, _runId: string): Promise<MCPCommand> {
        const text = assertionText.toLowerCase().trim();

        // 验证文本存在
        if (text.includes('包含') || text.includes('显示') || text.includes('出现')) {
            const textMatch = assertionText.match(/["']([^"']+)["']/) || assertionText.match(/包含(.+)/);
            return {
                name: 'browser_assert_text',
                arguments: { text: textMatch ? textMatch[1] : assertionText }
            };
        }

        // 验证元素存在
        if (text.includes('存在') || text.includes('可见')) {
            return {
                name: 'browser_assert_element',
                arguments: { selector: assertionText }
            };
        }

        // 默认：文本断言
        return {
            name: 'browser_assert_text',
            arguments: { text: assertionText }
        };
    }

    /**
     * 🔥 AI批量更新：检查测试用例相关性
     */
    async checkTestCaseRelevance(changeBrief: string, testCase: any): Promise<{
        is_relevant: boolean;
        relevance_score: number;
        recall_reason: string;
    }> {
        console.log(`🔍 [AITestParser] 检查用例相关性: ${testCase.title || testCase.id}`);

        try {
            // 构建相关性检查的用户提示词
            const userPrompt = this.buildRelevanceCheckPrompt(changeBrief, testCase);

            // 调用AI模型进行相关性分析
            const aiResponse = await this.callLLM(userPrompt, 'relevance_check');

            // 解析AI相关性分析结果
            const result = this.parseRelevanceResponse(aiResponse);

            console.log(`✅ [AITestParser] 相关性检查完成: ${result.is_relevant ? '相关' : '不相关'} (${Math.round(result.relevance_score * 100)}%)`);
            return result;

        } catch (error: any) {
            console.error(`❌ [AITestParser] 相关性检查失败: ${error.message}`);
            // 回退到基本的关键词匹配
            return this.fallbackRelevanceCheck(changeBrief, testCase);
        }
    }

    /**
     * 🔥 AI批量更新：生成测试用例更新方案
     */
    async generateTestCaseUpdate(changeBrief: string, testCase: any): Promise<{
        reasoning: string;
        patch: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }>;
        side_effects: Array<{ description: string; severity: 'low' | 'medium' | 'high'; }>;
        risk_level: 'low' | 'medium' | 'high';
    }> {
        console.log(`🤖 [AITestParser] 生成用例更新: ${testCase.title || testCase.id}`);

        try {
            // 构建用例更新的用户提示词
            const userPrompt = this.buildUpdateGenerationPrompt(changeBrief, testCase);

            // 调用AI模型生成更新方案
            const aiResponse = await this.callLLM(userPrompt, 'update_generation');

            // 解析AI更新方案
            const result = this.parseUpdateResponse(aiResponse);

            console.log(`✅ [AITestParser] 更新方案生成完成: ${result.patch.length} 个修改`);
            return result;

        } catch (error: any) {
            console.error(`❌ [AITestParser] 更新方案生成失败: ${error.message}`);
            // 回退到基本的模式匹配
            return this.fallbackUpdateGeneration(changeBrief, testCase);
        }
    }

    /**
     * 🔥 构建相关性检查的AI提示词
     */
    private buildRelevanceCheckPrompt(changeBrief: string, testCase: any): string {
        return `# 测试用例相关性分析任务

## 变更描述
"${changeBrief}"

## 待分析的测试用例
**标题**: ${testCase.title || '未知标题'}
**系统**: ${testCase.system || '未知系统'} 
**模块**: ${testCase.module || '未知模块'}
**标签**: ${testCase.tags ? JSON.stringify(testCase.tags) : '无标签'}
**步骤**: 
${this.formatTestStepsForAI(testCase.steps)}

## 分析要求
请分析这个测试用例是否与变更描述相关，需要根据以下维度评估：

1. **功能相关性**：测试用例覆盖的功能是否与变更相关
2. **操作相关性**：测试步骤中的操作是否与变更提及的操作相关  
3. **UI元素相关性**：测试涉及的界面元素是否与变更相关
4. **业务流程相关性**：测试的业务流程是否受变更影响

## 输出格式
请严格按照以下JSON格式输出：
\`\`\`json
{
  "is_relevant": true/false,
  "relevance_score": 0.0-1.0的数值,
  "recall_reason": "详细说明相关/不相关的原因，包括具体的匹配点或分析依据"
}
\`\`\`

请开始分析：`;
    }

    /**
     * 🔥 构建更新生成的AI提示词
     */
    private buildUpdateGenerationPrompt(changeBrief: string, testCase: any): string {
        return `# 测试用例更新生成任务

## 变更描述
"${changeBrief}"

## 目标测试用例
**标题**: ${testCase.title || '未知标题'}
**系统**: ${testCase.system || '未知系统'}
**模块**: ${testCase.module || '未知模块'} 
**当前步骤**:
${this.formatTestStepsForAI(testCase.steps)}

## 任务要求
基于变更描述，为这个测试用例生成精确的JSON Patch修改方案：

1. **识别需要修改的步骤**：分析哪些测试步骤需要根据变更进行调整
2. **生成JSON Patch操作**：为每个需要修改的地方生成对应的patch操作
3. **评估副作用和风险**：分析修改可能带来的影响
4. **提供修改理由**：说明为什么要进行这些修改

## JSON Patch格式说明
- 操作类型：replace(替换), add(添加), remove(删除)
- 路径格式：\`/steps/0/description\` (修改第1个步骤的描述)
- 路径格式：\`/steps/1/expectedResult\` (修改第2个步骤的预期结果)

## 输出格式
请严格按照以下JSON格式输出：
\`\`\`json
{
  "reasoning": "详细的修改理由和分析过程",
  "patch": [
    {
      "op": "replace",
      "path": "/steps/索引/字段名", 
      "value": "新的值"
    }
  ],
  "side_effects": [
    {
      "description": "可能的副作用描述",
      "severity": "low/medium/high"
    }
  ],
  "risk_level": "low/medium/high"
}
\`\`\`

请开始分析并生成更新方案：`;
    }

    /**
     * 🔥 格式化测试步骤供AI分析
     */
    private formatTestStepsForAI(steps: any): string {
        if (!steps) {
            return '无步骤信息';
        }

        if (Array.isArray(steps)) {
            return steps.map((step: any, index: number) => {
                const desc = step.description || step.action || '无描述';
                const expected = step.expectedResult || step.expected || '';
                return `${index + 1}. ${desc}${expected ? ` (预期: ${expected})` : ''}`;
            }).join('\n');
        }

        if (typeof steps === 'string') {
            return steps;
        }

        return JSON.stringify(steps, null, 2);
    }

    /**
     * 🔥 解析相关性AI响应
     */
    private parseRelevanceResponse(aiResponse: string): {
        is_relevant: boolean;
        relevance_score: number;
        recall_reason: string;
    } {
        try {
            console.log(`🔍 解析相关性AI响应: ${aiResponse.substring(0, 200)}...`);

            let jsonText = aiResponse.trim();

            // 提取JSON内容
            const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) ||
                jsonText.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                jsonText = jsonMatch[1] || jsonMatch[0];
            }

            const parsed = JSON.parse(jsonText);

            // 验证必需字段
            if (typeof parsed.is_relevant !== 'boolean') {
                throw new Error('缺少is_relevant字段或类型不正确');
            }

            const result = {
                is_relevant: parsed.is_relevant,
                relevance_score: typeof parsed.relevance_score === 'number' ?
                    Math.max(0, Math.min(1, parsed.relevance_score)) : 0.5,
                recall_reason: parsed.recall_reason || '未提供原因'
            };

            console.log(`✅ 相关性解析成功: ${result.is_relevant} (${Math.round(result.relevance_score * 100)}%)`);
            return result;

        } catch (error: any) {
            console.error(`❌ 相关性响应解析失败: ${error.message}`);
            throw new Error(`相关性响应解析失败: ${error.message}`);
        }
    }

    /**
     * 🔥 解析AI更新生成响应
     */
    private parseUpdateResponse(aiResponse: string): {
        reasoning: string;
        patch: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }>;
        side_effects: Array<{ description: string; severity: 'low' | 'medium' | 'high'; }>;
        risk_level: 'low' | 'medium' | 'high';
    } {
        try {
            console.log(`🔍 解析更新AI响应: ${aiResponse.substring(0, 200)}...`);

            let jsonText = aiResponse.trim();

            // 提取JSON内容
            const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) ||
                jsonText.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                jsonText = jsonMatch[1] || jsonMatch[0];
            }

            const parsed = JSON.parse(jsonText);

            // 验证并规范化数据
            const result = {
                reasoning: parsed.reasoning || '未提供修改理由',
                patch: Array.isArray(parsed.patch) ? parsed.patch.filter((p: any) =>
                    p.op && p.path && ['replace', 'add', 'remove'].includes(p.op)
                ) : [],
                side_effects: Array.isArray(parsed.side_effects) ? parsed.side_effects.filter((se: any) =>
                    se.description && ['low', 'medium', 'high'].includes(se.severity)
                ) : [],
                risk_level: ['low', 'medium', 'high'].includes(parsed.risk_level) ?
                    parsed.risk_level : 'medium'
            };

            console.log(`✅ 更新方案解析成功: ${result.patch.length} 个patch操作`);
            return result;

        } catch (error: any) {
            console.error(`❌ 更新响应解析失败: ${error.message}`);
            throw new Error(`更新响应解析失败: ${error.message}`);
        }
    }

    /**
     * 🔥 回退相关性检查方法
     */
    private fallbackRelevanceCheck(changeBrief: string, testCase: any): {
        is_relevant: boolean;
        relevance_score: number;
        recall_reason: string;
    } {
        console.log(`⚠️ [AITestParser] 使用回退相关性检查`);

        const caseText = `${testCase.title || ''} ${JSON.stringify(testCase.steps || {})}`.toLowerCase();
        const changeText = changeBrief.toLowerCase();

        // 基于关键词匹配的简单相关性判断
        const keywords = changeText.split(/\s+/).filter(w => w.length > 2);
        let matchCount = 0;

        for (const keyword of keywords) {
            if (caseText.includes(keyword)) {
                matchCount++;
            }
        }

        const relevanceScore = matchCount / Math.max(keywords.length, 1);
        const isRelevant = relevanceScore > 0.1;

        return {
            is_relevant: isRelevant,
            relevance_score: relevanceScore,
            recall_reason: isRelevant ?
                `关键词匹配 ${matchCount}/${keywords.length} (回退模式)` :
                '无关键词匹配 (回退模式)'
        };
    }

    /**
     * 🔥 回退更新生成方法
     */
    private fallbackUpdateGeneration(changeBrief: string, testCase: any): {
        reasoning: string;
        patch: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }>;
        side_effects: Array<{ description: string; severity: 'low' | 'medium' | 'high'; }>;
        risk_level: 'low' | 'medium' | 'high';
    } {
        console.log(`⚠️ [AITestParser] 使用回退更新生成`);

        const patches: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }> = [];

        // 简单的模式匹配更新
        if (!testCase.steps || !Array.isArray(testCase.steps)) {
            return {
                reasoning: `测试用例步骤格式无效 (回退模式)`,
                patch: [],
                side_effects: [],
                risk_level: 'low'
            };
        }

        // 示例：如果变更涉及"弹窗"，则修改相关步骤
        if (changeBrief.includes('弹窗') || changeBrief.includes('模态')) {
            for (let i = 0; i < testCase.steps.length; i++) {
                const step = testCase.steps[i];
                if (step.description && step.description.includes('跳转')) {
                    patches.push({
                        op: 'replace',
                        path: `/steps/${i}/description`,
                        value: step.description.replace('跳转', '弹窗')
                    });
                }
            }
        }

        return {
            reasoning: `基于关键词匹配的简单更新 (回退模式)`,
            patch: patches,
            side_effects: [],
            risk_level: patches.length > 0 ? 'medium' : 'low'
        };
    }
}

