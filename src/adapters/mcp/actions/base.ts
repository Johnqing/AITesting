import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ExecutionResult } from '../types.js';

/**
 * 操作基类
 */
export abstract class BaseAction {
    protected client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * 执行操作
     */
    abstract execute(...args: any[]): Promise<ExecutionResult>;

    /**
     * 提取工具调用的内容
     */
    protected extractContent(result: any): string | null {
        return Array.isArray(result.content) && result.content.length > 0
            ? result.content[0]?.text || null
            : null;
    }
}

