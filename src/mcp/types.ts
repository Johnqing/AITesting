/**
 * Playwright MCP 客户端类型定义
 */

export interface ExecutionResult {
    success: boolean;
    message: string;
    screenshot?: string;
    error?: string;
}

export interface SnapshotElement {
    text: string;
    role: string;
    ref: string;
}

