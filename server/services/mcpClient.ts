import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { TestStep } from '../../src/types/test.js';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { screenshotConfig } from '../../src/utils/screenshotConfig.js';

const require = createRequire(import.meta.url);

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 120000; // 120 seconds
const TOOL_CALL_TIMEOUT = 90000; // 90 seconds
const INIT_RETRY_DELAY = 2000;
const MAX_RETRIES = 3;
const DOM_STABLE_CHECK_DELAY = 1000;
const ELEMENT_READY_TIMEOUT = 5000;
const MIN_CONFIDENCE_THRESHOLD = 50;
const FALLBACK_CONFIDENCE_THRESHOLD = 20;

const REQUIRED_TOOLS = [
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_snapshot'
];

const DEFAULT_TOOLS = [
  ...REQUIRED_TOOLS,
  'browser_wait_for',
  'browser_take_screenshot'
];

// ============================================================================
// Types
// ============================================================================

export interface McpExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  verificationInfo?: {
    inputVerified?: boolean;
    inputValue?: string;
    clickSuccess?: boolean;
    urlChanged?: boolean;
  };
}

interface ElementMatch {
  ref: string;
  text: string;
  confidence?: number;
  reasons?: string;
}

interface SnapshotData {
  elements: Array<{
    ref: string;
    texts: string[];
    role: string;
    type: string;
    fullLine: string;
  }>;
  pageInfo: {
    url: string;
    title: string;
    elementCount: number;
  };
}

interface InitializeOptions {
  reuseSession?: boolean;
  contextState?: any;
  headless?: boolean; // 是否使用无头模式
}

interface ExtendedTestStep extends TestStep {
  ref?: string;
  arguments?: any;
}

// ============================================================================
// Helper Classes
// ============================================================================

class ScreenshotHandler {
  constructor(
    private client: Client<any, any>,
    private getToolName: (name: string) => string
  ) { }

  async takeScreenshot(filename: string): Promise<void> {
    try {
      await this.client.callTool({
        name: this.getToolName('screenshot'),
        arguments: { filename }
      });
      await this.handlePostProcess(filename);
    } catch (error) {
      console.error(`Screenshot failed: ${error}`);
    }
  }

  async takeScreenshotForStream(
    options: { runId?: string; filename?: string } = {}
  ): Promise<{ buffer: Buffer; source: 'mcp-direct' | 'filesystem'; durationMs: number }> {
    const startedAt = Date.now();
    const runTag = options.runId?.slice(0, 12) ?? 'stream';
    const filename = options.filename ?? `stream-${runTag}-${Date.now()}.png`;
    const screenshotDir = screenshotConfig.getScreenshotsDirectory();
    const fallbackPath = path.join(screenshotDir, filename);

    try {
      screenshotConfig.ensureScreenshotsDirectory();
    } catch (dirError) {
      console.warn('Failed to create screenshot directory:', this.normaliseError(dirError).message);
    }

    let result;
    try {
      result = await this.client.callTool({
        name: this.getToolName('screenshot'),
        arguments: { filename }
      });
    } catch (callError: any) {
      throw new Error(`Screenshot tool call failed: ${this.normaliseError(callError).message}`);
    }

    const directBuffer = this.extractImageBuffer(result);
    if (directBuffer) {
      return {
        buffer: directBuffer,
        source: 'mcp-direct',
        durationMs: Date.now() - startedAt
      };
    }

    const toolError = this.extractScreenshotError(result);
    if (toolError) {
      throw new Error(toolError);
    }

    const resolvedPath = (await this.handlePostProcess(filename, fallbackPath)) ??
      this.locateScreenshotFile(filename, fallbackPath);

    if (!resolvedPath) {
      throw new Error(`Screenshot file not found: ${filename}`);
    }

    try {
      const buffer = await this.readWithRetries(resolvedPath);
      if (filename.startsWith('stream-')) {
        await fs.promises.unlink(resolvedPath).catch(() => undefined);
      }
      return {
        buffer,
        source: 'filesystem',
        durationMs: Date.now() - startedAt
      };
    } catch (fsError) {
      throw new Error(`Failed to read screenshot: ${this.normaliseError(fsError).message}`);
    }
  }

  private async readWithRetries(filePath: string, attempts = 4, delayMs = 30): Promise<Buffer> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fs.promises.readFile(filePath);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Unknown error'));
  }

  private extractImageBuffer(result: unknown): Buffer | null {
    if (!result || typeof result !== 'object') return null;

    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const entry of content) {
        const decoded = this.decodeImagePayload(entry);
        if (decoded) return decoded;
      }
    }

    const topLevelData = (result as { data?: unknown }).data;
    if (typeof topLevelData === 'string') {
      try {
        return Buffer.from(topLevelData, 'base64');
      } catch {
        return null;
      }
    }

    return null;
  }

  private decodeImagePayload(payload: unknown): Buffer | null {
    if (!payload || typeof payload !== 'object') return null;

    const item = payload as {
      type?: unknown;
      data?: unknown;
      base64Data?: unknown;
      body?: unknown;
      mimeType?: unknown;
      mime_type?: unknown;
    };

    const base64Candidate =
      (typeof item.data === 'string' && item.data) ||
      (typeof item.base64Data === 'string' && item.base64Data) ||
      (typeof item.body === 'string' && item.body) ||
      undefined;

    if (!base64Candidate) return null;

    const mime = item.mimeType ?? item.mime_type;
    const declaredType = item.type;

    if (declaredType === 'image' || (typeof mime === 'string' && mime.startsWith('image/'))) {
      try {
        return Buffer.from(base64Candidate, 'base64');
      } catch {
        return null;
      }
    }

    return null;
  }

  private extractScreenshotError(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null;

    const payload = result as {
      isError?: boolean;
      error?: unknown;
      errors?: unknown;
      message?: unknown;
      content?: unknown;
    };

    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return `MCP_SCREENSHOT_ERROR: ${payload.error.trim()}`;
    }

    if (Array.isArray(payload.errors)) {
      const combined = payload.errors
        .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
        .join('; ');
      if (combined.length > 0) return `MCP_SCREENSHOT_ERROR: ${combined}`;
    }

    if (typeof payload.message === 'string' && payload.message.trim().length > 0 && payload.isError) {
      return `MCP_SCREENSHOT_ERROR: ${payload.message.trim()}`;
    }

    const contentText = this.extractTextContent(payload.content);
    if (contentText) {
      const lower = contentText.toLowerCase();
      if (payload.isError || lower.startsWith('error')) {
        return `MCP_SCREENSHOT_ERROR: ${contentText}`;
      }
    }

    return null;
  }

  private extractTextContent(content: unknown): string | null {
    if (!content) return null;

    const entries = Array.isArray(content) ? content : [content];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;

      const candidate = entry as { text?: unknown; message?: unknown; content?: unknown };
      if (typeof candidate.text === 'string' && candidate.text.trim().length > 0) {
        return candidate.text.trim();
      }
      if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
        return candidate.message.trim();
      }
      if (typeof candidate.content === 'string' && candidate.content.trim().length > 0) {
        return candidate.content.trim();
      }
    }

    return null;
  }

  private buildCandidatePaths(filename: string, preferredPath?: string): string[] {
    const candidates = new Set<string>();
    if (preferredPath) {
      candidates.add(path.normalize(preferredPath));
    }

    const screenshotDir = screenshotConfig.getScreenshotsDirectory();
    const staticPaths = [
      filename,
      path.join(process.cwd(), filename),
      path.join(screenshotDir, filename),
      path.join(process.cwd(), 'temp-screenshots', filename),
      path.join(process.cwd(), 'screenshots', filename),
      path.join(process.cwd(), 'node_modules', '@playwright', 'mcp', filename),
      path.join(process.cwd(), 'node_modules', '.bin', filename),
      path.join(process.cwd(), 'playwright-report', filename),
      path.join(process.cwd(), 'test-results', filename),
      path.join(os.tmpdir(), filename),
      path.join(os.homedir(), filename)
    ];

    for (const candidate of staticPaths) {
      if (candidate && candidate.trim().length > 0) {
        candidates.add(path.normalize(candidate));
      }
    }

    const envDirectories = [
      process.env.PLAYWRIGHT_MCP_OUTPUT_DIR,
      process.env.MCP_OUTPUT_DIR,
      process.env.PLAYWRIGHT_SCREENSHOTS_DIR,
      process.env.MCP_SCREENSHOT_DIR,
      process.env.PLAYWRIGHT_DOWNLOAD_DIR,
      process.env.PLAYWRIGHT_TEMP_DIR,
      process.env.PLAYWRIGHT_BROWSERS_PATH
    ].filter((value): value is string => Boolean(value && value.trim().length > 0));

    for (const directory of envDirectories) {
      candidates.add(path.normalize(path.join(directory, filename)));
    }

    return Array.from(candidates);
  }

  private locateScreenshotFile(filename: string, preferredPath?: string): string | null {
    const candidates = this.buildCandidatePaths(filename, preferredPath);

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          const stats = fs.statSync(candidate);
          if (stats.isFile() && stats.size > 0) {
            return candidate;
          }
        }
      } catch {
        // Ignore individual path check errors
      }
    }

    return null;
  }

  private async handlePostProcess(filename: string, targetPath?: string): Promise<string | null> {
    try {
      const targetDir = screenshotConfig.getScreenshotsDirectory();
      const finalPath = targetPath || path.join(targetDir, filename);
      const sourceFile = this.locateScreenshotFile(filename, finalPath);

      if (!sourceFile) {
        return null;
      }

      screenshotConfig.ensureScreenshotsDirectory();

      if (path.resolve(sourceFile) === path.resolve(finalPath)) {
        return finalPath;
      }

      try {
        await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
      } catch {
        // Ignore mkdir errors
      }

      fs.copyFileSync(sourceFile, finalPath);

      if (fs.existsSync(finalPath)) {
        if (sourceFile !== finalPath) {
          try {
            fs.unlinkSync(sourceFile);
          } catch {
            // Ignore delete errors
          }
        }
        return finalPath;
      }

      return null;
    } catch (error) {
      console.error('Screenshot post-processing failed', error);
      return null;
    }
  }

  private normaliseError(error: unknown): Error {
    if (error instanceof Error) return error;
    if (typeof error === 'string') return new Error(error);
    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error('Unknown error');
    }
  }
}

// ============================================================================
// Main Class
// ============================================================================

export class PlaywrightMcpClient {
  private client: Client<any, any> | null = null;
  private transport: StdioClientTransport | null = null;
  private isInitialized = false;
  private snapshot: string | null = null;
  private useAlternativeToolNames = false;
  private screenshotHandler: ScreenshotHandler | null = null;
  private browserLaunched = false; // 跟踪浏览器是否已启动
  private isHeadless = false; // 跟踪是否使用无头模式

  // ========================================================================
  // Static Methods
  // ========================================================================

  public static async ensureBrowserInstalled(): Promise<void> {
    console.log('[BrowserInstall] ========================================');
    console.log('[BrowserInstall] 开始检查浏览器安装状态...');

    try {
      // 查找可能的浏览器路径
      const possiblePaths = [
        process.env.PLAYWRIGHT_BROWSERS_PATH,
        path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
        path.join(os.homedir(), '.cache', 'ms-playwright'),
        path.join(process.cwd(), 'node_modules', 'playwright-core', '.local-browsers')
      ].filter(Boolean) as string[];

      console.log('[BrowserInstall] 检查浏览器路径:', possiblePaths);

      let browserPath = '';
      for (const browserDir of possiblePaths) {
        if (fs.existsSync(browserDir)) {
          try {
            const entries = fs.readdirSync(browserDir, { withFileTypes: true });
            const chromiumDir = entries.find(
              entry => entry.isDirectory() && entry.name.startsWith('chromium-')
            );
            if (chromiumDir) {
              browserPath = browserDir;
              console.log(`[BrowserInstall] ✅ 找到已安装的浏览器: ${browserDir}/${chromiumDir.name}`);
              break;
            }
          } catch (e) {
            // 忽略读取错误
          }
        }
      }

      if (!browserPath) {
        console.log('[BrowserInstall] ⚠️  未找到已安装的浏览器，尝试安装...');

        const tempTransport = new StdioClientTransport({
          command: 'npx',
          args: ['@playwright/mcp', '--browser', 'chromium'],
          env: {
            ...process.env,
            PLAYWRIGHT_HEADLESS: 'false', // 安装时使用有头模式
            HEADLESS: 'false',
            PLAYWRIGHT_TIMEOUT: String(DEFAULT_TIMEOUT),
            PLAYWRIGHT_LAUNCH_TIMEOUT: String(DEFAULT_TIMEOUT),
            PLAYWRIGHT_NAVIGATION_TIMEOUT: String(DEFAULT_TIMEOUT)
          }
        });

        const tempClient = new Client({ name: 'browser-installer', version: '1.0.0' }, {});

        try {
          console.log('[BrowserInstall] 连接安装客户端...');
          await tempClient.connect(tempTransport);
          console.log('[BrowserInstall] 调用 browser_install 工具...');
          const installResult = await tempClient.callTool({ name: 'browser_install', arguments: {} });
          console.log('[BrowserInstall] ✅ 浏览器安装完成');
          console.log('[BrowserInstall] 安装结果:', JSON.stringify(installResult, null, 2).substring(0, 500));
        } catch (installError: any) {
          console.error('[BrowserInstall] ❌ 浏览器安装失败:', {
            message: installError?.message,
            name: installError?.name
          });
          throw installError;
        } finally {
          try {
            await tempClient.close();
          } catch {
            // Ignore cleanup errors
          }
        }
      } else {
        console.log('[BrowserInstall] ✅ 浏览器已安装，跳过安装步骤');
      }

      console.log('[BrowserInstall] ========================================');
    } catch (error: any) {
      console.error('[BrowserInstall] ❌ 浏览器安装检查失败:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack?.split('\n').slice(0, 3).join('\n')
      });
      console.log('[BrowserInstall] ⚠️  将继续初始化，浏览器可能在首次使用时安装');
      console.log('[BrowserInstall] ========================================');
      // 不抛出错误，让初始化继续
    }
  }

  // ========================================================================
  // Initialization & Cleanup
  // ========================================================================

  async initialize(options: InitializeOptions = {}): Promise<void> {
    const startTime = Date.now();
    console.log('[MCP] ========================================');
    console.log('[MCP] 开始初始化 MCP Playwright 客户端');
    console.log('[MCP] 选项:', JSON.stringify(options, null, 2));
    console.log('[MCP] 当前状态:', {
      isInitialized: this.isInitialized,
      browserLaunched: this.browserLaunched,
      isHeadless: this.isHeadless
    });

    if (this.isInitialized && options.reuseSession) {
      console.log('[MCP] 复用现有 MCP 会话');
      if (options.contextState) {
        console.log('[MCP] 恢复上下文状态...');
        await this.setContextState(options.contextState);
      }
      return;
    }

    if (this.isInitialized) {
      console.log('[MCP] 检测到已初始化，先关闭现有会话...');
      await this.close();
    }

    console.log('[MCP] 正在启动 MCP Playwright 服务器...');

    try {
      // 检查并安装浏览器
      console.log('[MCP] 检查浏览器安装状态...');
      try {
        await PlaywrightMcpClient.ensureBrowserInstalled();
        console.log('[MCP] ✅ 浏览器安装检查完成');
      } catch (installError: any) {
        console.warn('[MCP] ⚠️  浏览器安装检查失败，继续初始化:', installError?.message);
      }

      // 创建临时目录
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-chrome-'));
      console.log('[MCP] 临时目录:', tmpDir);

      // 查找浏览器路径
      const browserPath = this.findBrowserPath();
      console.log('[MCP] 浏览器路径:', browserPath || '(未找到，将使用默认路径)');

      if (browserPath) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = browserPath;
        console.log('[MCP] 已设置 PLAYWRIGHT_BROWSERS_PATH:', browserPath);
      }

      // 设置浏览器参数
      console.log('[MCP] 设置浏览器启动参数...');
      this.setupBrowserArgs(tmpDir);
      console.log('[MCP] MCP_LAUNCH_PERSISTENT_ARGS:', process.env.MCP_LAUNCH_PERSISTENT_ARGS);

      // 设置环境变量
      console.log('[MCP] 设置环境变量...');
      this.setupEnvironmentVariables();
      console.log('[MCP] 环境变量:', {
        PLAYWRIGHT_TIMEOUT: process.env.PLAYWRIGHT_TIMEOUT,
        PLAYWRIGHT_LAUNCH_TIMEOUT: process.env.PLAYWRIGHT_LAUNCH_TIMEOUT,
        PLAYWRIGHT_NAVIGATION_TIMEOUT: process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT,
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED
      });

      const screenshotDir = screenshotConfig.getScreenshotsDirectory();
      console.log('[MCP] 截图目录:', screenshotDir);
      screenshotConfig.ensureScreenshotsDirectory();
      console.log('[MCP] 截图目录已确保存在');

      // 检查是否使用无头模式（明确处理：默认有头模式，除非明确设置为 true）
      // 如果 options.headless 是 undefined，检查环境变量
      // 如果环境变量也不是 'true'，则默认为 false（有头模式）
      let headless: boolean;
      if (options.headless !== undefined) {
        headless = options.headless;
        console.log('[MCP] 从选项获取 headless 值:', headless);
      } else {
        // 检查环境变量，只有明确设置为 'true' 才是无头模式
        const envHeadless = process.env.PLAYWRIGHT_HEADLESS === 'true' || process.env.HEADLESS === 'true';
        headless = envHeadless;
        console.log('[MCP] 从环境变量获取 headless 值:', envHeadless);
      }

      // 确保 headless 是明确的布尔值
      headless = Boolean(headless);
      this.isHeadless = headless;

      console.log('[MCP] ========================================');
      console.log('[MCP] 浏览器模式设置:');
      console.log('[MCP]   - 最终 headless 值:', headless);
      console.log('[MCP]   - 模式:', headless ? '无头模式 (headless)' : '有头模式 (headed)');
      console.log('[MCP]   - 选项 headless:', options.headless);
      console.log('[MCP]   - 环境变量 PLAYWRIGHT_HEADLESS:', process.env.PLAYWRIGHT_HEADLESS);
      console.log('[MCP]   - 环境变量 HEADLESS:', process.env.HEADLESS);
      console.log('[MCP] ========================================');

      console.log('[MCP] 创建 StdioClientTransport...');
      // 明确设置 headless 环境变量，确保传递正确的值
      const headlessEnvValue = headless ? 'true' : 'false';
      const transportEnv: Record<string, string> = {
        ...process.env,
        PLAYWRIGHT_HEADLESS: headlessEnvValue,
        HEADLESS: headlessEnvValue, // 同时设置两个环境变量
        PLAYWRIGHT_TIMEOUT: String(DEFAULT_TIMEOUT),
        PLAYWRIGHT_LAUNCH_TIMEOUT: String(DEFAULT_TIMEOUT),
        PLAYWRIGHT_NAVIGATION_TIMEOUT: String(DEFAULT_TIMEOUT),
        PLAYWRIGHT_MCP_OUTPUT_DIR: screenshotDir,
        MCP_OUTPUT_DIR: screenshotDir,
        PLAYWRIGHT_SCREENSHOTS_DIR: screenshotDir,
        MCP_SCREENSHOT_DIR: screenshotDir,
        PLAYWRIGHT_DOWNLOAD_DIR: screenshotDir,
        PLAYWRIGHT_TEMP_DIR: screenshotDir
      };

      // 只在 browserPath 存在时设置
      if (browserPath) {
        transportEnv.PLAYWRIGHT_BROWSERS_PATH = browserPath;
      }

      // 移除可能存在的 undefined 值
      Object.keys(transportEnv).forEach(key => {
        const value = transportEnv[key];
        if (value === undefined || value === null) {
          delete transportEnv[key];
        }
      });

      console.log('[MCP] Transport 环境变量配置:');
      console.log('[MCP]   - PLAYWRIGHT_BROWSERS_PATH:', transportEnv.PLAYWRIGHT_BROWSERS_PATH || '(未设置)');
      console.log('[MCP]   - PLAYWRIGHT_HEADLESS:', transportEnv.PLAYWRIGHT_HEADLESS);
      console.log('[MCP]   - HEADLESS:', transportEnv.HEADLESS);
      console.log('[MCP]   - PLAYWRIGHT_TIMEOUT:', transportEnv.PLAYWRIGHT_TIMEOUT);

      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['@playwright/mcp', '--browser', 'chromium'],
        env: transportEnv
      });
      console.log('[MCP] ✅ Transport 创建完成');

      console.log('[MCP] 创建 MCP Client...');
      this.client = new Client({ name: 'ai-test-client', version: '1.0.0' }, {});

      console.log('[MCP] 连接 Transport...');
      const connectStartTime = Date.now();
      await this.client.connect(this.transport);
      const connectDuration = Date.now() - connectStartTime;
      console.log(`[MCP] Transport 连接成功 (耗时: ${connectDuration}ms)`);

      console.log('[MCP] 等待初始化延迟...');
      await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY));
      this.isInitialized = true;
      console.log('[MCP] 客户端已标记为已初始化');

      console.log('[MCP] 验证可用工具...');
      const verifyStartTime = Date.now();
      await this.verifyTools();
      const verifyDuration = Date.now() - verifyStartTime;
      console.log(`[MCP] 工具验证完成 (耗时: ${verifyDuration}ms)`);
      console.log('[MCP] 使用备用工具名称:', this.useAlternativeToolNames);

      // 移除预启动逻辑，避免创建空白标签页
      // 浏览器将在首次真正的导航时自动启动
      console.log('[MCP] 浏览器将在首次导航时自动启动（不会创建空白标签页）');

      if (options.contextState) {
        console.log('[MCP] 恢复上下文状态...');
        await this.setContextState(options.contextState);
      }

      console.log('[MCP] 创建 ScreenshotHandler...');
      this.screenshotHandler = new ScreenshotHandler(this.client, (name) => this.getToolName(name));
      console.log('[MCP] ScreenshotHandler 创建完成');

      // 🔥 修复：初始化后立即检查并关闭所有多余的标签页
      console.log('[MCP] 初始化后检查并清理多余的标签页...');
      await this.cleanupExtraTabs();

      const totalDuration = Date.now() - startTime;
      console.log('[MCP] ========================================');
      console.log(`[MCP] ✅ MCP 服务器启动成功 (总耗时: ${totalDuration}ms)`);
      console.log('[MCP] 最终状态:', {
        isInitialized: this.isInitialized,
        browserLaunched: this.browserLaunched,
        isHeadless: this.isHeadless,
        useAlternativeToolNames: this.useAlternativeToolNames
      });
      console.log('[MCP] ========================================');
    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      console.error('[MCP] ========================================');
      console.error(`[MCP] ❌ MCP 服务器启动失败 (耗时: ${totalDuration}ms)`);
      console.error('[MCP] 错误详情:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      console.error('[MCP] 当前状态:', {
        isInitialized: this.isInitialized,
        browserLaunched: this.browserLaunched,
        isHeadless: this.isHeadless
      });
      console.error('[MCP] ========================================');
      this.isInitialized = false;
      throw new Error(`MCP server startup failed: ${error.message}`);
    }
  }

  async close(): Promise<void> {
    console.log('[MCP] ========================================');
    console.log('[MCP] 开始关闭 MCP 会话');
    console.log('[MCP] 关闭前状态:', {
      isInitialized: this.isInitialized,
      browserLaunched: this.browserLaunched,
      isHeadless: this.isHeadless,
      hasClient: !!this.client,
      hasTransport: !!this.transport,
      hasSnapshot: !!this.snapshot
    });

    // 🔥 修复：在关闭 MCP Client 之前，先尝试关闭所有浏览器标签页
    // 移除 browserLaunched 检查，因为浏览器可能已启动但标志未设置
    if (this.isInitialized && this.client) {
      try {
        console.log('[MCP] 尝试关闭所有浏览器标签页...');
        // 尝试获取标签页列表并关闭多余的标签页
        try {
          const tabsResult = await this.client.callTool({
            name: 'browser_tab_list',
            arguments: {}
          });

          // 解析标签页列表
          let tabs = this.parseTabListResult(tabsResult);
          let maxAttempts = 3; // 最多尝试3次，确保所有标签页都被关闭
          let attempt = 0;

          while (tabs && tabs.length > 0 && attempt < maxAttempts) {
            attempt++;
            console.log(`[MCP] 第 ${attempt} 次尝试：发现 ${tabs.length} 个标签页，准备关闭...`);

            // 关闭所有标签页（从后往前关闭，避免索引变化）
            for (let i = tabs.length - 1; i >= 0; i--) {
              try {
                await this.client.callTool({
                  name: 'browser_tab_close',
                  arguments: { tabId: tabs[i].id || tabs[i].index }
                });
                console.log(`[MCP] ✅ 已关闭标签页 ${i + 1}/${tabs.length}`);
                // 短暂延迟，确保标签页关闭完成
                await new Promise(resolve => setTimeout(resolve, 100));
              } catch (closeTabError: any) {
                console.warn(`[MCP] ⚠️  关闭标签页 ${i + 1} 失败:`, closeTabError?.message);
              }
            }

            // 等待一下，然后再次检查是否还有标签页
            await new Promise(resolve => setTimeout(resolve, 300));

            // 再次获取标签页列表，检查是否还有剩余
            try {
              const remainingTabsResult = await this.client.callTool({
                name: 'browser_tab_list',
                arguments: {}
              });
              tabs = this.parseTabListResult(remainingTabsResult);
              if (tabs && tabs.length > 0) {
                console.log(`[MCP] ⚠️  仍有 ${tabs.length} 个标签页未关闭，继续尝试...`);
              } else {
                console.log(`[MCP] ✅ 所有标签页已关闭`);
                break;
              }
            } catch (checkError: any) {
              console.warn(`[MCP] ⚠️  检查剩余标签页失败:`, checkError?.message);
              break; // 如果检查失败，假设已经关闭完成
            }
          }

          if (tabs && tabs.length > 0) {
            console.warn(`[MCP] ⚠️  经过 ${maxAttempts} 次尝试，仍有 ${tabs.length} 个标签页未关闭`);
          } else if (attempt === 0) {
            console.log('[MCP] 没有发现标签页，跳过关闭');
          }
        } catch (tabListError: any) {
          // 如果获取标签页列表失败，可能是工具不存在或浏览器已关闭，继续执行关闭流程
          console.warn('[MCP] ⚠️  获取标签页列表失败（可能浏览器已关闭）:', tabListError?.message);
        }
      } catch (closeTabsError: any) {
        console.warn('[MCP] ⚠️  关闭标签页时出错，继续关闭流程:', closeTabsError?.message);
      }
    }

    if (this.isInitialized && this.client) {
      try {
        console.log('[MCP] 关闭 MCP Client...');
        await this.client.close();
        console.log('[MCP] ✅ MCP Client 关闭成功');
      } catch (e: any) {
        console.warn('[MCP] ⚠️  关闭 MCP Client 时出错:', {
          message: e?.message,
          name: e?.name
        });
      }
    } else {
      console.log('[MCP] 跳过关闭 Client (未初始化或不存在)');
    }

    if (this.transport) {
      try {
        console.log('[MCP] 关闭 Transport...');
        await this.transport.close();
        console.log('[MCP] ✅ Transport 关闭成功');
      } catch (e: any) {
        console.warn('[MCP] ⚠️  关闭 Transport 时出错:', {
          message: e?.message,
          name: e?.name
        });
      }
    } else {
      console.log('[MCP] 跳过关闭 Transport (不存在)');
    }

    console.log('[MCP] 清理状态变量...');
    this.client = null;
    this.transport = null;
    this.isInitialized = false;
    this.snapshot = null;
    this.screenshotHandler = null;
    this.browserLaunched = false;
    this.isHeadless = false;

    console.log('[MCP] ✅ MCP 会话已关闭');
    console.log('[MCP] ========================================');
  }

  // 🔥 新增：清理多余的标签页（保留最多1个）
  private async cleanupExtraTabs(): Promise<void> {
    if (!this.isInitialized || !this.client) {
      console.log('[MCP] 跳过清理标签页（MCP未初始化）');
      return;
    }

    try {
      console.log('[MCP] 开始清理多余的标签页...');

      // 使用超时保护，避免等待过久
      const tabsResult = await Promise.race([
        this.client.callTool({
          name: 'browser_tab_list',
          arguments: {}
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('获取标签页列表超时')), 5000)
        )
      ]) as any;

      const tabs = this.parseTabListResult(tabsResult);
      if (!tabs || tabs.length === 0) {
        console.log('[MCP] 没有发现标签页，无需清理');
        return;
      }

      console.log(`[MCP] 发现 ${tabs.length} 个标签页`);

      // 如果只有一个标签页，不需要清理
      if (tabs.length === 1) {
        console.log('[MCP] 只有1个标签页，无需清理');
        return;
      }

      // 保留第一个标签页，关闭其他所有标签页
      console.log(`[MCP] 准备关闭 ${tabs.length - 1} 个多余的标签页...`);
      let closedCount = 0;
      for (let i = tabs.length - 1; i > 0; i--) {
        try {
          await Promise.race([
            this.client.callTool({
              name: 'browser_tab_close',
              arguments: { tabId: tabs[i].id || tabs[i].index }
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('关闭标签页超时')), 3000)
            )
          ]);
          closedCount++;
          console.log(`[MCP] ✅ 已关闭标签页 ${i + 1}/${tabs.length} (已关闭 ${closedCount} 个)`);
          await new Promise(resolve => setTimeout(resolve, 150)); // 增加延迟，确保关闭完成
        } catch (closeTabError: any) {
          console.warn(`[MCP] ⚠️  关闭标签页 ${i + 1} 失败:`, closeTabError?.message);
        }
      }

      // 验证清理结果
      await new Promise(resolve => setTimeout(resolve, 500)); // 增加等待时间
      try {
        const remainingTabsResult = await Promise.race([
          this.client.callTool({
            name: 'browser_tab_list',
            arguments: {}
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('验证标签页列表超时')), 5000)
          )
        ]) as any;
        const remainingTabs = this.parseTabListResult(remainingTabsResult);
        const remainingCount = remainingTabs?.length || 0;
        console.log(`[MCP] ✅ 标签页清理完成，剩余 ${remainingCount} 个标签页 (已关闭 ${closedCount} 个)`);

        // 如果还有多个标签页，再次尝试清理
        if (remainingCount > 1) {
          console.log(`[MCP] ⚠️  仍有 ${remainingCount} 个标签页，再次尝试清理...`);
          await this.cleanupExtraTabs(); // 递归调用
        }
      } catch (verifyError: any) {
        console.warn('[MCP] ⚠️  验证清理结果失败:', verifyError?.message);
      }
    } catch (error: any) {
      // 如果清理失败，不影响主流程，只记录警告
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('超时') || errorMsg.includes('浏览器未启动') || errorMsg.includes('not found')) {
        console.log('[MCP] ℹ️  清理标签页跳过（浏览器可能未启动）:', errorMsg);
      } else {
        console.warn('[MCP] ⚠️  清理标签页失败:', errorMsg);
      }
    }
  }

  // 🔥 新增：解析标签页列表结果
  private parseTabListResult(result: any): Array<{ id?: string; index: number; title: string; active: boolean }> | null {
    try {
      if (!result || !result.content) return null;

      const content = Array.isArray(result.content) ? result.content : [result.content];
      for (const item of content) {
        if (item.type === 'text' && item.text) {
          try {
            const parsed = JSON.parse(item.text);
            if (Array.isArray(parsed)) {
              return parsed.map((tab: any, index: number) => ({
                id: tab.id || tab.tabId,
                index: tab.index !== undefined ? tab.index : index,
                title: tab.title || tab.name || '',
                active: tab.active || false
              }));
            }
          } catch {
            // 如果不是 JSON，尝试其他解析方式
          }
        }
      }
    } catch (error) {
      console.warn('[MCP] 解析标签页列表失败:', error);
    }
    return null;
  }

  // ========================================================================
  // Tool Management
  // ========================================================================

  public async callTool(args: { name: string; arguments: any; }): Promise<any> {
    // 🔥 修复：检查连接状态，如果断开则尝试重连
    if (!this.isInitialized || !this.client) {
      console.warn(`[MCP] ⚠️  MCP客户端未初始化，尝试重新初始化...`);
      try {
        // 尝试重新初始化（不关闭旧的，因为可能已经关闭）
        const headless = this.isHeadless;
        await this.initialize({ headless });
        console.log(`[MCP] ✅ MCP客户端重新初始化成功`);
      } catch (reinitError: any) {
        console.error(`[MCP] ❌ 重新初始化失败:`, reinitError?.message);
        throw new Error('MCP_DISCONNECTED: Client is not initialized and reinitialization failed.');
      }
    }

    // 🔥 修复：在执行前再次检查连接状态
    if (!this.isInitialized || !this.client) {
      throw new Error('MCP_DISCONNECTED: Client is not initialized.');
    }

    try {
      console.log(`🔧 MCP工具调用: ${args.name}`, args.arguments);

      // 🔥 增加超时保护（90秒）
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('MCP工具调用超时(90秒)')), TOOL_CALL_TIMEOUT);
      });

      let result;
      try {
        result = await Promise.race([
          this.client.callTool(args),
          timeoutPromise
        ]);
      } catch (callError: any) {
        // 🔥 修复：如果调用失败且是连接错误，尝试重连一次
        const errorMsg = callError?.message || String(callError);
        if (errorMsg.includes('not connected') || errorMsg.includes('not initialized') ||
          errorMsg.includes('Connection closed') || errorMsg.includes('disconnected')) {
          console.warn(`[MCP] ⚠️  MCP调用失败（连接问题），尝试重新初始化: ${errorMsg}`);

          // 标记为未初始化，然后重新初始化
          this.isInitialized = false;
          const headless = this.isHeadless;

          try {
            await this.initialize({ headless });
            console.log(`[MCP] ✅ MCP客户端重新初始化成功，重试调用...`);

            // 重试调用
            result = await Promise.race([
              this.client!.callTool(args),
              timeoutPromise
            ]);
          } catch (reinitError: any) {
            console.error(`[MCP] ❌ 重新初始化失败:`, reinitError?.message);
            throw new Error(`MCP_DISCONNECTED: Client reconnection failed. Original error: ${errorMsg}`);
          }
        } else {
          // 其他错误直接抛出
          throw callError;
        }
      }

      // 🔥 详细记录MCP返回结果
      console.log(`📋 MCP工具返回结果: ${args.name}`, JSON.stringify(result, null, 2).substring(0, 500));

      // 🔥 检查返回结果中的错误信息
      if (result && (result as any).content) {
        const content = Array.isArray((result as any).content) ? (result as any).content : [(result as any).content];
        for (const item of content) {
          if (item && item.type === 'text' && item.text) {
            console.log(`📄 MCP返回内容: ${item.text.substring(0, 200)}`);
            // 🔥 修复：检查是否包含错误信息，如果包含则抛出异常
            const errorText = item.text.toLowerCase();
            if (errorText.includes('error:') || errorText.includes('failed:') ||
              errorText.includes('exception:') || errorText.includes('cannot') ||
              errorText.includes('not found') || errorText.includes('timeout') ||
              (errorText.includes('error') && !errorText.includes('no error'))) {
              const errorMsg = item.text.substring(0, 500);
              console.error(`❌ MCP命令执行错误: ${errorMsg}`);
              throw new Error(`MCP工具执行失败 [${args.name}]: ${errorMsg}`);
            }
          }
        }
      }

      // 🔥 检查返回结果中是否有isError字段
      if (result && (result as any).isError === true) {
        const errorMsg = (result as any).error || (result as any).message || '未知错误';
        console.error(`❌ MCP工具返回错误标志: ${errorMsg}`);
        throw new Error(`MCP工具执行失败 [${args.name}]: ${errorMsg}`);
      }

      console.log(`✅ MCP工具调用成功: ${args.name}`);
      return result;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`❌ MCP工具调用失败: ${args.name}`, {
        error: errorMsg,
        arguments: args.arguments
      });

      // 🔥 修复：如果是连接错误，抛出更明确的错误信息
      if (errorMsg.includes('not connected') || errorMsg.includes('not initialized') ||
        errorMsg.includes('Connection closed') || errorMsg.includes('disconnected')) {
        throw new Error(`MCP_DISCONNECTED: ${errorMsg}`);
      }

      throw new Error(`MCP工具调用失败 [${args.name}]: ${errorMsg}`);
    }
  }

  public async listAvailableTools(): Promise<string[]> {
    if (!this.isInitialized || !this.client) {
      throw new Error('MCP_DISCONNECTED: Client is not initialized.');
    }

    try {
      const result = await this.client.listTools();
      const toolNames = result.tools.map(t => t.name);
      return toolNames;
    } catch (error: any) {
      const isSchemaError =
        error.message?.includes('invalid_value') ||
        error.message?.includes('inputSchema') ||
        error.message?.includes('expected "object"') ||
        (error.message && JSON.stringify(error.message).includes('inputSchema'));

      if (isSchemaError) {
        console.warn('Schema validation error detected, using default tool list');
        return DEFAULT_TOOLS;
      }

      throw new Error(`Failed to get MCP tool list: ${error.message}`);
    }
  }

  private getToolName(baseName: string): string {
    try {
      const { MCPToolMapper } = require('../utils/mcpToolMapper.js');
      return MCPToolMapper.getToolName(baseName);
    } catch (error) {
      console.warn('Failed to load MCPToolMapper, using fallback mapping');
      const fallbackMap: Record<string, string> = {
        navigate: 'browser_navigate',
        click: 'browser_click',
        fill: 'browser_type',
        input: 'browser_type',
        type: 'browser_type',
        wait: 'browser_wait_for',
        screenshot: 'browser_take_screenshot',
        expect: 'browser_snapshot'
      };
      return fallbackMap[baseName] || `browser_${baseName}`;
    }
  }

  private async verifyTools(): Promise<void> {
    console.log('[MCP Tools] 开始验证可用工具...');
    let availableTools: string[] = [];
    let retryCount = 0;

    while (availableTools.length === 0 && retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`[MCP Tools] 尝试获取工具列表 (第 ${retryCount}/${MAX_RETRIES} 次)...`);
      try {
        availableTools = await this.listAvailableTools();
        console.log(`[MCP Tools] 获取到 ${availableTools.length} 个工具`);
        if (availableTools.length > 0) {
          console.log(`[MCP Tools] 工具列表:`, availableTools);
        }
        if (availableTools.length === 0 && retryCount < MAX_RETRIES) {
          console.log(`[MCP Tools] 工具列表为空，等待 ${INIT_RETRY_DELAY}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY));
        }
      } catch (error: any) {
        console.warn(`[MCP Tools] 获取工具列表失败 (第 ${retryCount} 次):`, {
          message: error.message,
          name: error.name
        });
        if (retryCount < MAX_RETRIES) {
          console.log(`[MCP Tools] 等待 ${INIT_RETRY_DELAY}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY));
        }
      }
    }

    if (availableTools.length === 0) {
      console.log('[MCP Tools] 通过 listAvailableTools 未获取到工具，尝试直接调用 listTools...');
      try {
        const toolsResult = await this.client!.listTools();
        console.log('[MCP Tools] listTools 返回结果:', {
          hasTools: !!toolsResult.tools,
          toolsCount: toolsResult.tools?.length || 0
        });
        if (toolsResult.tools && toolsResult.tools.length > 0) {
          availableTools = toolsResult.tools.map(t => t.name).filter(name => name);
          console.log(`[MCP Tools] 从 listTools 获取到 ${availableTools.length} 个工具:`, availableTools);
        } else {
          console.warn('[MCP Tools] listTools 返回空列表，使用默认工具列表');
          availableTools = REQUIRED_TOOLS;
        }
      } catch (directError: any) {
        console.error('[MCP Tools] 直接调用 listTools 失败:', {
          message: directError.message,
          name: directError.name
        });
        const isSchemaError =
          directError.message?.includes('invalid_value') ||
          directError.message?.includes('inputSchema') ||
          directError.message?.includes('expected "object"');

        if (isSchemaError) {
          console.warn('[MCP Tools] 检测到 Schema 错误，使用默认工具列表');
          availableTools = REQUIRED_TOOLS;
        } else {
          throw new Error(`MCP server provides no tools: ${directError.message}`);
        }
      }
    }

    if (availableTools.length === 0) {
      console.error('[MCP Tools] ❌ 未找到任何可用工具');
      throw new Error('MCP server provides no tools');
    }

    console.log(`[MCP Tools] ✅ 最终工具列表 (${availableTools.length} 个):`, availableTools);
    this.useAlternativeToolNames = availableTools.some(tool => tool.startsWith('browser_'));
    console.log(`[MCP Tools] 使用备用工具名称: ${this.useAlternativeToolNames}`);

    try {
      console.log('[MCP Tools] 检查必需工具是否可用...');
      const toolsResult = await this.client!.listTools();
      const availableToolNames = toolsResult.tools.map(t => t.name);
      console.log(`[MCP Tools] 可用工具名称:`, availableToolNames);

      const missingTools = REQUIRED_TOOLS.filter(
        tool =>
          !availableToolNames.includes(tool) &&
          !availableToolNames.includes('mcp_playwright_' + tool.replace('browser_', ''))
      );

      if (missingTools.length > 0) {
        console.warn(`[MCP Tools] ⚠️  缺少必需工具: ${missingTools.join(', ')}`);
        this.useAlternativeToolNames = true;
        console.log(`[MCP Tools] 已启用备用工具名称模式`);
      } else {
        console.log(`[MCP Tools] ✅ 所有必需工具都可用`);
      }
    } catch (verifyError: any) {
      console.warn('[MCP Tools] ⚠️  工具验证失败，将在实际使用时重试');
      console.warn('[MCP Tools] 验证错误:', {
        message: verifyError?.message,
        name: verifyError?.name
      });
    }
  }

  // ========================================================================
  // Browser Setup
  // ========================================================================

  private findBrowserPath(): string {
    console.log('[BrowserPath] 开始查找浏览器路径...');
    const possiblePaths = [
      path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
      path.join(process.cwd(), 'node_modules', 'playwright-core', '.local-browsers')
    ];
    console.log('[BrowserPath] 可能的路径:', possiblePaths);

    for (const browserDir of possiblePaths) {
      console.log(`[BrowserPath] 检查路径: ${browserDir}`);
      if (fs.existsSync(browserDir)) {
        console.log(`[BrowserPath] ✅ 路径存在: ${browserDir}`);
        try {
          const entries = fs.readdirSync(browserDir, { withFileTypes: true });
          console.log(`[BrowserPath] 目录项数: ${entries.length}`);
          const chromiumDir = entries.find(
            entry => entry.isDirectory() && entry.name.startsWith('chromium-')
          );
          if (chromiumDir) {
            console.log(`[BrowserPath] ✅ 找到 Chromium 目录: ${chromiumDir.name}`);
            console.log(`[BrowserPath] 返回路径: ${browserDir}`);
            return browserDir;
          } else {
            console.log(`[BrowserPath] ⚠️  未找到 Chromium 目录`);
            const dirNames = entries.filter(e => e.isDirectory()).map(e => e.name);
            console.log(`[BrowserPath] 目录列表:`, dirNames.slice(0, 10));
          }
        } catch (readError: any) {
          console.warn(`[BrowserPath] ⚠️  读取目录失败:`, readError?.message);
        }
      } else {
        console.log(`[BrowserPath] ❌ 路径不存在: ${browserDir}`);
      }
    }

    console.log('[BrowserPath] ⚠️  未找到浏览器路径，返回空字符串');
    return '';
  }

  private setupBrowserArgs(tmpDir: string): void {
    console.log('[BrowserArgs] 设置浏览器启动参数...');
    const enhancedArgs = [
      `--user-data-dir=${tmpDir}`,
      '--no-first-run',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-popup-blocking',
      '--disable-sync',
      '--start-maximized',
      '--window-size=1920,1080',
      // '--kiosk', // 注释掉 kiosk 模式，以便可以看到浏览器窗口
      '--app=data:text/html,<title>AI Test Browser</title>'
    ];

    console.log('[BrowserArgs] 浏览器参数:', enhancedArgs);
    process.env.MCP_LAUNCH_PERSISTENT_ARGS = JSON.stringify(enhancedArgs);
    console.log('[BrowserArgs] ✅ MCP_LAUNCH_PERSISTENT_ARGS 已设置');
  }

  private setupEnvironmentVariables(): void {
    console.log('[EnvVars] 设置环境变量...');
    const envVars = {
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      PLAYWRIGHT_TIMEOUT: String(DEFAULT_TIMEOUT),
      PLAYWRIGHT_LAUNCH_TIMEOUT: String(DEFAULT_TIMEOUT),
      PLAYWRIGHT_NAVIGATION_TIMEOUT: String(DEFAULT_TIMEOUT),
      PLAYWRIGHT_IGNORE_HTTPS_ERRORS: 'true'
    };

    Object.entries(envVars).forEach(([key, value]) => {
      process.env[key] = value;
      console.log(`[EnvVars] ${key} = ${value}`);
    });

    console.log('[EnvVars] ✅ 环境变量设置完成');
  }

  // ========================================================================
  // Test Execution
  // ========================================================================

  async executeStep(step: TestStep, runId: string): Promise<McpExecutionResult> {
    const executeStartTime = Date.now();
    console.log(`[ExecuteStep ${runId}] ========================================`);
    console.log(`[ExecuteStep ${runId}] 开始执行步骤`);
    const stepInfo = {
      id: step.id,
      description: step.description,
      action: step.action,
      url: (step as any).url,
      selector: step.selector,
      ref: (step as any).ref,
      element: (step as any).element,
      order: step.order
    };
    console.log(`[ExecuteStep ${runId}] 步骤信息:`, stepInfo);

    // 🔥 新增：记录关键步骤信息（特别是点击和输入操作）
    const actionStr = String(step.action);
    if (actionStr === 'browser_click' || actionStr === 'click') {
      console.log(`🖱️ [ExecuteStep ${runId}] ===== 点击操作开始 =====`);
      console.log(`🖱️ [ExecuteStep ${runId}] 目标元素信息:`, {
        ref: (step as any).ref || '(未提供)',
        element: (step as any).element || '(未提供)',
        selector: step.selector || '(未提供)',
        description: step.description
      });
    }
    console.log(`[ExecuteStep ${runId}] 客户端状态:`, {
      isInitialized: this.isInitialized,
      hasClient: !!this.client,
      browserLaunched: this.browserLaunched,
      isHeadless: this.isHeadless
    });

    if (!this.isInitialized || !this.client) {
      console.error(`[ExecuteStep ${runId}] ❌ 客户端未初始化`);
      throw new Error('MCP_DISCONNECTED: Client is not initialized.');
    }

    try {
      const verificationInfo: McpExecutionResult['verificationInfo'] = {};
      const actionStr = String(step.action);

      // 对于点击操作，记录点击前的URL
      let beforeClickUrl = '';
      if (actionStr === 'browser_click' || actionStr === 'click') {
        beforeClickUrl = await this.getCurrentUrl();
      }

      // 执行步骤
      await this.executeMcpStep(step, runId);

      // 对于输入操作，执行验证
      if (actionStr === 'browser_type' || actionStr === 'type' || actionStr === 'fill' || actionStr === 'input') {
        const expectedText = (step as any).text || '';
        if (expectedText && (step as any).ref) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 等待输入完成
          const verificationResult = await this.verifyInputValue((step as any).ref, expectedText, runId);
          verificationInfo.inputVerified = verificationResult.success;
          verificationInfo.inputValue = verificationResult.actualValue;
        }
      }

      // 对于点击操作，检查URL变化和页面内容变化
      if (actionStr === 'browser_click' || actionStr === 'click') {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 等待页面响应
        const afterClickUrl = await this.getCurrentUrl();
        verificationInfo.clickSuccess = true;
        verificationInfo.urlChanged = beforeClickUrl !== afterClickUrl;

        // 🔥 增强：对于菜单点击等操作，需要额外验证页面内容是否变化
        const isMenuClick = step.description?.includes('菜单') || step.description?.includes('测试') || step.description?.includes('导航');
        if (isMenuClick && !verificationInfo.urlChanged) {
          // 对于菜单点击，即使URL没变化，也需要等待页面内容加载
          console.log(`🔄 [ExecuteStep ${runId}] 菜单点击操作，等待页面内容加载...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 额外等待2秒
          // 刷新快照以获取最新页面状态
          await this.refreshSnapshot();
          console.log(`✅ [ExecuteStep ${runId}] 页面快照已更新，菜单点击可能已生效`);
        }

        // 🔥 新增：记录点击操作的详细结果
        console.log(`🖱️ [ExecuteStep ${runId}] ===== 点击操作完成 =====`);
        console.log(`🖱️ [ExecuteStep ${runId}] 点击结果:`, {
          success: true,
          urlChanged: verificationInfo.urlChanged,
          beforeUrl: beforeClickUrl,
          afterUrl: afterClickUrl,
          description: step.description,
          isMenuClick: isMenuClick
        });
      }

      const executeDuration = Date.now() - executeStartTime;
      console.log(`[ExecuteStep ${runId}] ✅ 步骤执行成功 (耗时: ${executeDuration}ms)`);
      console.log(`[ExecuteStep ${runId}] ========================================`);
      return { success: true, verificationInfo };
    } catch (error: any) {
      const executeDuration = Date.now() - executeStartTime;
      console.error(`[ExecuteStep ${runId}] ❌ 步骤执行失败 (耗时: ${executeDuration}ms)`);
      console.error(`[ExecuteStep ${runId}] 错误详情:`, {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
      console.error(`[ExecuteStep ${runId}] ========================================`);
      return { success: false, error: error.message };
    }
  }

  async executeMcpStep(step: TestStep, runId: string): Promise<any> {
    const maxRetries = 2;
    let lastError: any;

    for (let retry = 1; retry <= maxRetries; retry++) {
      try {
        // 🔥 修复：每次重试前都验证命令格式
        const validationError = this.validateStepCommand(step, runId);
        if (validationError) {
          console.error(`❌ [${runId}] 命令格式验证失败 (重试 ${retry}/${maxRetries}): ${validationError}`);
          if (retry < maxRetries) {
            // 尝试修复命令格式
            const fixedStep = this.tryFixStepCommand(step, runId);
            if (fixedStep) {
              console.log(`🔧 [${runId}] 尝试修复命令格式...`);
              Object.assign(step, fixedStep);
              continue;
            }
          }
          throw new Error(`命令格式错误: ${validationError}`);
        }

        const result = await this.executeMcpStepInternal(step, runId);
        if (retry > 1) {
          console.log(`[${runId}] MCP step retry succeeded: ${step.action}`);
        }
        return result;
      } catch (error: any) {
        lastError = error;

        // 🔥 修复：检查是否是命令格式错误
        if (error.message?.includes('命令格式错误') || error.message?.includes('缺少') || error.message?.includes('参数')) {
          if (retry < maxRetries) {
            console.log(`🔄 [${runId}] 命令格式错误，尝试修复后重试...`);
            const fixedStep = this.tryFixStepCommand(step, runId);
            if (fixedStep) {
              Object.assign(step, fixedStep);
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
          }
          throw lastError;
        }

        const isComputedStyleError =
          error.message?.includes('getComputedStyle') ||
          error.message?.includes('Element') ||
          error.message?.includes('not of type') ||
          error.message?.includes('parameter 1');

        if (isComputedStyleError && retry < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          await this.waitForDOMStable(1);
          continue;
        }

        // 🔥 修复：MCP连接错误，尝试重连
        if ((error.message?.includes('MCP_DISCONNECTED') || error.message?.includes('not connected') || error.message?.includes('not initialized')) && retry < maxRetries) {
          console.warn(`⚠️ [${runId}] 检测到MCP连接问题，尝试重新初始化...`);
          try {
            const headless = this.isHeadless;
            this.isInitialized = false;
            await this.initialize({ headless });
            console.log(`✅ [${runId}] MCP客户端重新初始化成功，继续重试...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } catch (reinitError: any) {
            console.error(`❌ [${runId}] MCP重新初始化失败: ${reinitError?.message}`);
            throw new Error(`MCP重新初始化失败: ${reinitError?.message}`);
          }
        }

        if (retry >= maxRetries) {
          throw lastError;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw lastError;
  }

  private async executeMcpStepInternal(step: TestStep, runId: string): Promise<any> {
    if (!this.client) throw new Error('MCP_DISCONNECTED: Client is null.');

    console.log(`🎬 [${runId}] === 开始执行步骤 ===`);
    console.log(`📝 步骤描述: ${step.description}`);
    console.log(`🎯 操作类型: ${step.action}`);
    console.log(`🔍 目标元素: ${step.selector || '无'}`);
    console.log(`📄 输入值: ${(step as any).value || (step as any).text || '无'}`);
    console.log(`🌐 目标URL: ${step.url || '无'}`);

    // 🔥 新增：验证AI解析的命令格式是否正确
    const validationError = this.validateStepCommand(step, runId);
    if (validationError) {
      console.error(`❌ [${runId}] 命令验证失败: ${validationError}`);
      throw new Error(`命令格式错误: ${validationError}`);
    }

    // 🔍 每个步骤前验证当前页面状态
    const extendedStep = step as ExtendedTestStep;
    const isNavigateAction =
      step.action === 'navigate' ||
      (extendedStep as any).action === 'browser_navigate' ||
      (extendedStep as any).action?.includes('navigate');

    if (!isNavigateAction) {
      await this.verifyCurrentPageState(runId);
    }

    // 🔥 先处理 browser_* 类型的操作（这些不在 TestAction 类型中）
    const actionStr = String(step.action);
    if (actionStr === 'browser_type') {
      console.log(`⌨️ [${runId}] 正在执行browser_type操作...`);
      console.log(`📋 [${runId}] 目标ref: ${(step as any).ref}, 输入文本: ${(step as any).text}`);

      // 🔥 修复：确保ref参数存在，如果不存在则尝试从element或selector获取
      let ref = (step as any).ref;
      if (!ref) {
        // 尝试从element或selector获取ref
        const element = (step as any).element || step.selector;
        if (element) {
          console.warn(`⚠️ [${runId}] browser_type缺少ref参数，尝试从element/selector获取: ${element}`);
          // 这里可以尝试通过快照查找ref，但为了简化，先记录警告
        } else {
          throw new Error('browser_type操作缺少必需的ref参数');
        }
      }

      // 🔥 修复：确保text参数存在（可以为空字符串）
      const text = (step as any).text !== undefined ? (step as any).text : ((step as any).value !== undefined ? (step as any).value : '');
      console.log(`📝 [${runId}] 最终输入文本: "${text}"`);

      // 🚀 修复：操作前确保页面完全稳定
      await this.waitForLoad();

      // 🚀 新增：操作前额外检查元素是否仍然存在
      if (ref) {
        await this.waitForElementReady(ref, runId);
      }

      // 直接使用AI提供的ref，无需查找元素
      const typeArgs = { ref, text };
      console.log(`🎯 [${runId}] MCP browser_type参数:`, JSON.stringify(typeArgs, null, 2));

      try {
        // 🔥 修复：执行工具调用并检查返回结果
        const typeResult = await this.client.callTool({
          name: 'browser_type',
          arguments: typeArgs
        });

        // 🔥 新增：验证返回结果，确保操作成功
        if (typeResult && (typeResult as any).content) {
          const content = Array.isArray((typeResult as any).content) ? (typeResult as any).content : [(typeResult as any).content];
          for (const item of content) {
            if (item && item.type === 'text' && item.text) {
              const errorText = item.text.toLowerCase();
              if (errorText.includes('error:') || errorText.includes('failed:') ||
                errorText.includes('exception:') || errorText.includes('cannot') ||
                errorText.includes('not found') || errorText.includes('timeout')) {
                const errorMsg = item.text.substring(0, 500);
                console.error(`❌ [${runId}] browser_type操作返回错误: ${errorMsg}`);
                throw new Error(`browser_type执行失败: ${errorMsg}`);
              }
            }
          }
        }

        console.log(`✅ [${runId}] browser_type操作完成`);

        // 🚀 修复：输入后等待页面响应完成
        await new Promise(resolve => setTimeout(resolve, 500));

        // 🔥 新增：验证输入是否成功
        const expectedText = (step as any).text || '';
        if (expectedText) {
          console.log(`🔍 [${runId}] ===== 开始验证输入框值 =====`);
          console.log(`🔍 [${runId}] 期望输入值: "${expectedText}"`);
          console.log(`🔍 [${runId}] 输入框ref: ${(step as any).ref}`);

          const verificationResult = await this.verifyInputValue((step as any).ref, expectedText, runId);

          if (!verificationResult.success) {
            console.warn(`⚠️ [${runId}] 输入验证失败: ${verificationResult.error}`);
            console.warn(`⚠️ [${runId}] 实际值: "${verificationResult.actualValue || '(未获取到)'}"`);
            // 尝试重新输入
            console.log(`🔄 [${runId}] 尝试重新输入...`);
            await new Promise(resolve => setTimeout(resolve, 300));
            await this.client.callTool({
              name: 'browser_type',
              arguments: typeArgs
            });
            await new Promise(resolve => setTimeout(resolve, 500));
            // 再次验证
            console.log(`🔍 [${runId}] 重新验证输入框值...`);
            const retryVerification = await this.verifyInputValue((step as any).ref, expectedText, runId);
            if (!retryVerification.success) {
              console.error(`❌ [${runId}] 重新输入后验证仍然失败`);
              console.error(`❌ [${runId}] 实际值: "${retryVerification.actualValue || '(未获取到)'}"`);
              throw new Error(`输入验证失败: 期望值 "${expectedText}" 未正确设置到输入框中。${retryVerification.error}`);
            }
            console.log(`✅ [${runId}] 重新输入后验证成功`);
            console.log(`✅ [${runId}] 实际值: "${retryVerification.actualValue}"`);
          } else {
            console.log(`✅ [${runId}] 输入验证成功: 输入框值已正确设置`);
            console.log(`✅ [${runId}] 实际值: "${verificationResult.actualValue}"`);
          }
          console.log(`🔍 [${runId}] ===== 输入验证完成 =====`);
        } else {
          console.warn(`⚠️ [${runId}] 未提供期望输入值，跳过验证`);
        }

      } catch (typeError: any) {
        console.error(`❌ [${runId}] browser_type操作失败:`, typeError);
        throw typeError;
      }

      await this.refreshSnapshot();
      console.log(`📊 [${runId}] browser_type操作后页面快照已更新`);
      return;
    }

    if (actionStr === 'browser_click') {
      console.log(`🖱️ [${runId}] ===== 开始执行browser_click操作 =====`);
      console.log(`📋 [${runId}] 步骤信息:`, {
        description: step.description,
        ref: (step as any).ref,
        element: (step as any).element,
        selector: step.selector
      });

      // 🔥 修复：确保ref参数存在，如果不存在则通过快照查找元素
      let ref = (step as any).ref;
      let elementDescription = (step as any).element || step.selector || step.description || '';

      if (!ref) {
        console.log(`⚠️ [${runId}] browser_click缺少ref参数，尝试通过快照查找元素...`);
        console.log(`🔍 [${runId}] 元素描述: "${elementDescription}"`);

        if (!elementDescription) {
          throw new Error('browser_click操作缺少必需的ref参数和element描述');
        }

        try {
          // 🔥 新增：通过快照查找元素
          console.log(`📸 [${runId}] 获取页面快照用于元素查找...`);
          if (!this.snapshot) {
            await this.refreshSnapshot();
          }

          const elementMatch = await this.findBestElement(elementDescription, runId);
          if (elementMatch && elementMatch.ref) {
            ref = elementMatch.ref;
            console.log(`✅ [${runId}] 通过快照找到元素: ref=${ref}, 置信度=${elementMatch.confidence}`);
            const reasonsText = Array.isArray(elementMatch.reasons)
              ? elementMatch.reasons.join(', ')
              : (elementMatch.reasons || '未知');
            console.log(`📝 [${runId}] 匹配原因: ${reasonsText}`);
          } else {
            throw new Error(`无法通过快照找到匹配的元素: "${elementDescription}"`);
          }
        } catch (findError: any) {
          console.error(`❌ [${runId}] 元素查找失败: ${findError.message}`);
          console.error(`❌ [${runId}] 尝试使用element描述作为fallback...`);
          // 如果查找失败，尝试直接使用element描述（MCP可能支持）
          // 但先抛出错误，让上层处理
          throw new Error(`browser_click操作无法找到目标元素: "${elementDescription}". 错误: ${findError.message}`);
        }
      } else {
        console.log(`✅ [${runId}] 使用提供的ref参数: ${ref}`);
      }

      // 🚀 修复：操作前确保页面完全稳定
      console.log(`⏳ [${runId}] 等待页面稳定...`);
      await this.waitForLoad();

      // 🚀 新增：操作前额外检查元素是否仍然存在
      if (ref) {
        console.log(`🔍 [${runId}] 检查元素是否就绪: ref=${ref}`);
        await this.waitForElementReady(ref, runId);
        console.log(`✅ [${runId}] 元素已就绪`);
      }

      // 构建点击参数
      const clickArgs: any = {};
      if (ref) {
        clickArgs.ref = ref;
      }
      // 🔥 修复：如果ref存在，也要包含element描述（MCP可能需要）
      if (elementDescription) {
        clickArgs.element = elementDescription;
      }

      // 🔥 验证：确保至少有一个参数
      if (!clickArgs.ref && !clickArgs.element) {
        throw new Error(`browser_click操作缺少必需的参数: 既没有ref也没有element描述`);
      }

      console.log(`🎯 [${runId}] MCP browser_click最终参数:`, JSON.stringify(clickArgs, null, 2));

      try {
        // 记录点击前的页面状态
        const beforeClickUrl = await this.getCurrentUrl();
        const beforeClickTime = Date.now();
        console.log(`🔍 [${runId}] 点击前页面状态:`, {
          url: beforeClickUrl,
          timestamp: new Date(beforeClickTime).toISOString()
        });

        // 🔥 修复：执行工具调用并检查返回结果
        console.log(`🚀 [${runId}] 调用MCP browser_click工具...`);
        const clickStartTime = Date.now();
        const clickResult = await this.client.callTool({
          name: 'browser_click',
          arguments: clickArgs
        });
        const clickDuration = Date.now() - clickStartTime;
        console.log(`⏱️ [${runId}] MCP browser_click调用完成 (耗时: ${clickDuration}ms)`);

        // 🔥 新增：详细记录返回结果
        console.log(`📋 [${runId}] MCP browser_click返回结果:`, JSON.stringify(clickResult, null, 2).substring(0, 1000));

        // 🔥 新增：验证返回结果，确保操作成功
        if (clickResult && (clickResult as any).content) {
          const content = Array.isArray((clickResult as any).content) ? (clickResult as any).content : [(clickResult as any).content];
          for (const item of content) {
            if (item && item.type === 'text' && item.text) {
              const resultText = item.text;
              console.log(`📄 [${runId}] MCP返回文本内容: ${resultText.substring(0, 500)}`);

              const errorText = resultText.toLowerCase();
              if (errorText.includes('error:') || errorText.includes('failed:') ||
                errorText.includes('exception:') || errorText.includes('cannot') ||
                errorText.includes('not found') || errorText.includes('timeout') ||
                errorText.includes('element not found') || errorText.includes('no element')) {
                const errorMsg = resultText.substring(0, 500);
                console.error(`❌ [${runId}] browser_click操作返回错误: ${errorMsg}`);
                throw new Error(`browser_click执行失败: ${errorMsg}`);
              }

              // 检查是否包含成功信息
              if (errorText.includes('clicked') || errorText.includes('success') || errorText.includes('完成')) {
                console.log(`✅ [${runId}] MCP返回成功信息: ${resultText.substring(0, 200)}`);
              }
            }
          }
        }

        // 🔥 新增：检查返回结果中是否有isError字段
        if (clickResult && (clickResult as any).isError === true) {
          const errorMsg = (clickResult as any).error || (clickResult as any).message || '未知错误';
          console.error(`❌ [${runId}] browser_click操作返回错误标志: ${errorMsg}`);
          throw new Error(`browser_click执行失败: ${errorMsg}`);
        }

        console.log(`✅ [${runId}] browser_click操作完成`);

        // 🚀 修复：点击后等待页面响应完成
        console.log(`⏳ [${runId}] 等待页面响应...`);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 验证点击是否成功（通过检查URL或页面状态变化）
        const afterClickUrl = await this.getCurrentUrl();
        const afterClickTime = Date.now();
        const urlChanged = beforeClickUrl !== afterClickUrl;
        console.log(`🔍 [${runId}] 点击后页面状态:`, {
          url: afterClickUrl,
          urlChanged: urlChanged,
          timestamp: new Date(afterClickTime).toISOString(),
          elapsedTime: `${afterClickTime - beforeClickTime}ms`
        });

        if (urlChanged) {
          console.log(`✅ [${runId}] 按钮点击成功: 页面已导航到新URL`);
          console.log(`   ${beforeClickUrl} → ${afterClickUrl}`);
        } else {
          console.log(`✅ [${runId}] 按钮点击成功: 页面URL未变化（可能是表单提交、AJAX操作或单页应用导航）`);
        }

      } catch (clickError: any) {
        console.error(`❌ [${runId}] ===== browser_click操作失败 =====`);
        console.error(`❌ [${runId}] 错误信息:`, {
          message: clickError.message,
          name: clickError.name,
          stack: clickError.stack?.split('\n').slice(0, 5).join('\n')
        });
        console.error(`❌ [${runId}] 步骤信息:`, {
          description: step.description,
          ref: (step as any).ref,
          element: (step as any).element,
          selector: step.selector,
          clickArgs: JSON.stringify(clickArgs, null, 2)
        });
        throw clickError;
      }

      await this.refreshSnapshot();
      console.log(`📊 [${runId}] browser_click操作后页面快照已更新`);
      console.log(`🏁 [${runId}] ===== browser_click操作完成 =====\n`);
      return;
    }

    if (actionStr === 'browser_wait_for') {
      console.log(`⏱️ [${runId}] 正在执行browser_wait_for操作...`);

      // 获取等待参数
      const waitArgs = (step as any).arguments || { state: 'networkidle', timeout: 3000 };
      const state = waitArgs.state || 'networkidle';
      const timeout = waitArgs.timeout || 3000;

      console.log(`📋 [${runId}] 等待状态: ${state}, 超时时间: ${timeout}ms`);

      try {
        await this.client.callTool({
          name: 'browser_wait_for',
          arguments: { state, timeout }
        });
        console.log(`✅ [${runId}] browser_wait_for操作完成`);

        // 等待后刷新快照确保元素可见
        await this.refreshSnapshot();
        console.log(`📊 [${runId}] browser_wait_for操作后页面快照已更新`);
      } catch (waitError: any) {
        console.warn(`⚠️ [${runId}] browser_wait_for操作失败，使用固定等待时间: ${waitError.message}`);
        // 降级策略：使用固定等待时间
        await new Promise(resolve => setTimeout(resolve, timeout));
        await this.refreshSnapshot();
        console.log(`✅ [${runId}] 固定等待完成，页面快照已更新`);
      }
      return;
    }

    if (actionStr === 'browser_navigate') {
      console.log(`🌐 [${runId}] 正在执行browser_navigate操作...`);
      return this.handleNavigate(step, runId);
    }

    switch (step.action) {
      case 'navigate':
        return this.handleNavigate(step, runId);

      case 'click':
      case 'fill':
        return this.handleClickOrFill(step, runId);

      case 'wait':
        return this.handleWait(step, runId);

      case 'scroll':
        return this.handleScroll(runId);

      case 'screenshot':
        return this.handleScreenshot(runId);

      default:
        // Handle browser_* actions that may come from AI
        if ((extendedStep as any).action === 'browser_navigate') {
          return this.handleNavigate(step, runId);
        }

        // 🔥 支持所有MCP browser_*工具
        const actionStr = String(step.action);
        if (actionStr.startsWith('browser_')) {
          return this.handleBrowserTool(actionStr, step, runId);
        }

        throw new Error(`Unknown MCP action: ${step.action}`);
    }

    console.log(`🏁 [${runId}] === 步骤执行完成 ===\n`);
  }

  /**
   * 🔥 新增：验证AI解析后的命令格式是否正确
   */
  private validateStepCommand(step: TestStep, runId: string): string | null {
    const actionStr = String(step.action || '').trim();

    if (!actionStr) {
      return '命令缺少action字段';
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
        // 点击操作需要ref或element或selector
        if (!(step as any).ref && !(step as any).element && !step.selector && !step.description) {
          return '点击操作缺少目标元素标识（ref/element/selector/description）';
        }
        break;

      case 'browser_type':
      case 'type':
      case 'fill':
      case 'input':
        // 输入操作需要ref或element或selector
        if (!(step as any).ref && !(step as any).element && !step.selector && !step.description) {
          return '输入操作缺少目标元素标识（ref/element/selector/description）';
        }
        // text参数可以为空（清空输入框），但应该存在
        if ((step as any).text === undefined && (step as any).value === undefined) {
          // 允许text为空字符串（清空操作），但不允许undefined
          console.warn(`⚠️ [${runId}] 输入操作未指定text参数，将使用空字符串`);
        }
        break;

      case 'browser_wait_for':
      case 'wait':
        // 等待操作参数可选，不需要验证
        break;

      case 'browser_hover':
      case 'hover':
        if (!(step as any).ref && !(step as any).element && !step.selector && !step.description) {
          return '悬停操作缺少目标元素标识（ref/element/selector/description）';
        }
        break;

      case 'browser_scroll':
      case 'scroll':
        // 滚动操作参数可选
        break;

      default:
        // 对于未知操作，只检查基本格式
        if (actionStr.startsWith('browser_')) {
          // browser_* 操作至少应该有基本参数
          console.log(`ℹ️ [${runId}] 未知的browser_*操作: ${actionStr}，将尝试执行`);
        } else {
          console.warn(`⚠️ [${runId}] 未知的操作类型: ${actionStr}`);
        }
    }

    return null; // 验证通过
  }

  /**
   * 🔥 新增：尝试修复命令格式错误
   */
  private tryFixStepCommand(step: TestStep, runId: string): Partial<TestStep> | null {
    const actionStr = String(step.action || '').trim();
    const fixes: Partial<TestStep> = {};

    switch (actionStr) {
      case 'browser_click':
      case 'click':
        // 如果没有ref但有element，尝试使用element作为ref
        if (!(step as any).ref && (step as any).element) {
          console.log(`🔧 [${runId}] 修复：将element转换为ref`);
          (fixes as any).ref = (step as any).element;
        }
        // 如果没有ref和element但有selector，尝试使用selector
        else if (!(step as any).ref && !(step as any).element && step.selector) {
          console.log(`🔧 [${runId}] 修复：将selector转换为ref`);
          (fixes as any).ref = step.selector;
        }
        break;

      case 'browser_type':
      case 'type':
      case 'fill':
      case 'input':
        // 如果没有ref但有element，尝试使用element作为ref
        if (!(step as any).ref && (step as any).element) {
          console.log(`🔧 [${runId}] 修复：将element转换为ref`);
          (fixes as any).ref = (step as any).element;
        }
        // 如果没有ref和element但有selector，尝试使用selector
        else if (!(step as any).ref && !(step as any).element && step.selector) {
          console.log(`🔧 [${runId}] 修复：将selector转换为ref`);
          (fixes as any).ref = step.selector;
        }
        // 如果没有text但有value，尝试使用value作为text
        if ((step as any).text === undefined && (step as any).value !== undefined) {
          console.log(`🔧 [${runId}] 修复：将value转换为text`);
          (fixes as any).text = (step as any).value;
        }
        // 如果text和value都没有，设置为空字符串
        if ((step as any).text === undefined && (step as any).value === undefined) {
          console.log(`🔧 [${runId}] 修复：设置text为空字符串`);
          (fixes as any).text = '';
        }
        break;
    }

    return Object.keys(fixes).length > 0 ? fixes : null;
  }

  /**
   * 🔥 处理所有browser_*工具的统一入口
   * 支持所有MCP Playwright工具
   */
  private async handleBrowserTool(toolName: string, step: TestStep, runId: string): Promise<void> {
    console.log(`🔧 [${runId}] 执行MCP工具: ${toolName}`);

    // 构建工具参数
    const toolArgs: any = {};
    const stepAny = step as any;

    // 根据工具类型构建参数
    switch (toolName) {
      case 'browser_click':
        toolArgs.element = stepAny.element || step.description || '';
        toolArgs.ref = stepAny.ref;
        if (stepAny.doubleClick !== undefined) toolArgs.doubleClick = stepAny.doubleClick;
        if (stepAny.button) toolArgs.button = stepAny.button;
        if (stepAny.modifiers) toolArgs.modifiers = stepAny.modifiers;
        break;

      case 'browser_type':
        toolArgs.element = stepAny.element || step.description || '';
        toolArgs.ref = stepAny.ref;
        toolArgs.text = stepAny.text || stepAny.value || '';
        if (stepAny.submit !== undefined) toolArgs.submit = stepAny.submit;
        if (stepAny.slowly !== undefined) toolArgs.slowly = stepAny.slowly;
        break;

      case 'browser_hover':
        toolArgs.element = stepAny.element || step.description || '';
        toolArgs.ref = stepAny.ref;
        break;

      case 'browser_drag':
        toolArgs.startElement = stepAny.startElement || '';
        toolArgs.startRef = stepAny.startRef;
        toolArgs.endElement = stepAny.endElement || '';
        toolArgs.endRef = stepAny.endRef;
        break;

      case 'browser_select_option':
        toolArgs.element = stepAny.element || step.description || '';
        toolArgs.ref = stepAny.ref;
        toolArgs.values = stepAny.values || stepAny.value ? [stepAny.value] : [];
        break;

      case 'browser_fill_form':
        toolArgs.fields = stepAny.fields || [];
        break;

      case 'browser_evaluate':
        toolArgs.function = stepAny.function || stepAny.code || '';
        if (stepAny.element) toolArgs.element = stepAny.element;
        if (stepAny.ref) toolArgs.ref = stepAny.ref;
        break;

      case 'browser_file_upload':
        if (stepAny.paths) toolArgs.paths = stepAny.paths;
        break;

      case 'browser_handle_dialog':
        toolArgs.accept = stepAny.accept !== undefined ? stepAny.accept : true;
        if (stepAny.promptText) toolArgs.promptText = stepAny.promptText;
        break;

      case 'browser_press_key':
        toolArgs.key = stepAny.key || '';
        break;

      case 'browser_resize':
        toolArgs.width = stepAny.width;
        toolArgs.height = stepAny.height;
        break;

      case 'browser_run_code':
        toolArgs.code = stepAny.code || '';
        break;

      case 'browser_wait_for':
        if (stepAny.time !== undefined) toolArgs.time = stepAny.time;
        if (stepAny.text) toolArgs.text = stepAny.text;
        if (stepAny.textGone) toolArgs.textGone = stepAny.textGone;
        if (stepAny.state) toolArgs.state = stepAny.state;
        if (stepAny.timeout) toolArgs.timeout = stepAny.timeout;
        break;

      case 'browser_take_screenshot':
        if (stepAny.type) toolArgs.type = stepAny.type;
        if (stepAny.filename) toolArgs.filename = stepAny.filename;
        if (stepAny.element) toolArgs.element = stepAny.element;
        if (stepAny.ref) toolArgs.ref = stepAny.ref;
        if (stepAny.fullPage !== undefined) toolArgs.fullPage = stepAny.fullPage;
        break;

      case 'browser_console_messages':
        if (stepAny.level) toolArgs.level = stepAny.level;
        break;

      case 'browser_network_requests':
        if (stepAny.includeStatic !== undefined) toolArgs.includeStatic = stepAny.includeStatic;
        break;

      case 'browser_navigate_back':
        // 无参数
        break;

      case 'browser_close':
        // 无参数
        break;

      case 'browser_snapshot':
        // 无参数，但通常通过getSnapshot()调用
        break;

      default:
        // 对于其他browser_*工具，使用通用参数映射
        // 尝试从step.arguments或step的属性中提取参数
        if (stepAny.arguments) {
          Object.assign(toolArgs, stepAny.arguments);
        } else {
          // 通用参数提取
          if (stepAny.element) toolArgs.element = stepAny.element;
          if (stepAny.ref) toolArgs.ref = stepAny.ref;
          if (stepAny.text !== undefined) toolArgs.text = stepAny.text;
          if (stepAny.value !== undefined) toolArgs.value = stepAny.value;
          if (stepAny.url) toolArgs.url = stepAny.url;
        }
    }

    // 过滤掉undefined值
    const filteredArgs: any = {};
    for (const [key, value] of Object.entries(toolArgs)) {
      if (value !== undefined && value !== null) {
        filteredArgs[key] = value;
      }
    }

    console.log(`📋 [${runId}] ${toolName}参数:`, JSON.stringify(filteredArgs, null, 2));

    try {
      // 对于只读工具（如browser_snapshot, browser_console_messages），不需要刷新快照
      const readOnlyTools = ['browser_snapshot', 'browser_console_messages', 'browser_network_requests', 'browser_take_screenshot'];
      const isReadOnly = readOnlyTools.includes(toolName);

      // 🔥 修复：执行工具调用并检查返回结果
      const result = await this.client!.callTool({
        name: toolName,
        arguments: filteredArgs
      });

      // 🔥 新增：验证返回结果，确保操作成功
      if (result) {
        // 检查返回结果中是否包含错误信息
        if ((result as any).content) {
          const content = Array.isArray((result as any).content) ? (result as any).content : [(result as any).content];
          for (const item of content) {
            if (item && item.type === 'text' && item.text) {
              const errorText = item.text.toLowerCase();
              // 如果返回结果中包含错误信息，抛出异常
              if (errorText.includes('error:') || errorText.includes('failed:') ||
                errorText.includes('exception:') || errorText.includes('cannot') ||
                errorText.includes('not found') || errorText.includes('timeout') ||
                (errorText.includes('error') && !errorText.includes('no error'))) {
                const errorMsg = item.text.substring(0, 500);
                console.error(`❌ [${runId}] ${toolName}操作返回错误: ${errorMsg}`);
                throw new Error(`${toolName}执行失败: ${errorMsg}`);
              }
            }
          }
        }
        // 检查返回结果中是否有isError字段
        if ((result as any).isError === true) {
          const errorMsg = (result as any).error || (result as any).message || '未知错误';
          console.error(`❌ [${runId}] ${toolName}操作返回错误标志: ${errorMsg}`);
          throw new Error(`${toolName}执行失败: ${errorMsg}`);
        }
      }

      console.log(`✅ [${runId}] ${toolName}操作完成`);

      // 对于非只读工具，操作后刷新快照
      if (!isReadOnly) {
        await this.refreshSnapshot();
        console.log(`📊 [${runId}] ${toolName}操作后页面快照已更新`);
      }

      return;
    } catch (toolError: any) {
      console.error(`❌ [${runId}] ${toolName}操作失败:`, toolError.message);
      throw new Error(`${toolName} failed: ${toolError.message}`);
    }
  }

  private async handleNavigate(step: TestStep, runId: string): Promise<void> {
    const navigateStartTime = Date.now();
    const extendedStep = step as ExtendedTestStep;
    const targetUrl = step.url || extendedStep.arguments?.url || (step as any).url;

    console.log(`[Navigate ${runId}] ========================================`);
    console.log(`[Navigate ${runId}] 开始导航操作`);
    console.log(`[Navigate ${runId}] 目标 URL: ${targetUrl}`);
    console.log(`[Navigate ${runId}] 当前状态:`, {
      isHeadless: this.isHeadless,
      browserLaunched: this.browserLaunched,
      isInitialized: this.isInitialized
    });

    // 移除预启动逻辑，避免创建空白标签页
    // 浏览器将在首次导航时自动启动，browser_navigate 工具会自动处理浏览器启动
    console.log(`[Navigate ${runId}] 直接执行导航，浏览器将在首次导航时自动启动（不会创建空白标签页）`);

    // 🔥 修复：导航前清理多余的标签页，避免累积
    console.log(`[Navigate ${runId}] 导航前清理多余的标签页...`);
    await this.cleanupExtraTabs();

    console.log(`[Navigate ${runId}] 执行主导航操作...`);
    const mainNavigateStartTime = Date.now();
    let navigateResult: any;
    try {
      navigateResult = await this.client!.callTool({
        name: 'browser_navigate',
        arguments: { url: targetUrl }
      });

      // 检查返回结果是否包含错误
      if (navigateResult?.isError || navigateResult?.content) {
        const content = Array.isArray(navigateResult.content) ? navigateResult.content : [navigateResult.content];
        const errorText = content
          .filter((item: any) => item?.type === 'text' && item?.text)
          .map((item: any) => item.text)
          .join(' ');

        if (errorText && (errorText.includes('not installed') || errorText.includes('Browser specified'))) {
          console.error(`[Navigate ${runId}] ❌ 浏览器未安装错误`);
          console.error(`[Navigate ${runId}] 错误信息: ${errorText}`);
          console.log(`[Navigate ${runId}] 尝试安装浏览器...`);

          // 尝试安装浏览器
          try {
            await PlaywrightMcpClient.ensureBrowserInstalled();
            console.log(`[Navigate ${runId}] 浏览器安装完成，重试导航...`);

            // 重试导航
            navigateResult = await this.client!.callTool({
              name: 'browser_navigate',
              arguments: { url: targetUrl }
            });
            const retryDuration = Date.now() - mainNavigateStartTime;
            console.log(`[Navigate ${runId}] ✅ 重试导航成功 (总耗时: ${retryDuration}ms)`);
          } catch (installError: any) {
            console.error(`[Navigate ${runId}] ❌ 浏览器安装失败:`, installError?.message);
            throw new Error(`浏览器未安装且安装失败: ${errorText}. 安装错误: ${installError?.message}`);
          }
        } else if (errorText) {
          console.warn(`[Navigate ${runId}] ⚠️  导航返回警告: ${errorText}`);
        }
      }

      const mainNavigateDuration = Date.now() - mainNavigateStartTime;
      console.log(`[Navigate ${runId}] ✅ 主导航完成 (耗时: ${mainNavigateDuration}ms)`);
      console.log(`[Navigate ${runId}] 导航结果:`, JSON.stringify(navigateResult, null, 2).substring(0, 300));
    } catch (navigateError: any) {
      const navigateErrorDuration = Date.now() - mainNavigateStartTime;
      console.error(`[Navigate ${runId}] ❌ 导航失败 (耗时: ${navigateErrorDuration}ms)`);
      console.error(`[Navigate ${runId}] 错误详情:`, {
        message: navigateError?.message,
        name: navigateError?.name
      });

      // 如果是浏览器未安装错误，尝试安装
      if (navigateError?.message?.includes('not installed') || navigateError?.message?.includes('Browser specified')) {
        console.log(`[Navigate ${runId}] 检测到浏览器未安装错误，尝试安装...`);
        try {
          await PlaywrightMcpClient.ensureBrowserInstalled();
          console.log(`[Navigate ${runId}] 浏览器安装完成，重试导航...`);

          // 重试导航
          navigateResult = await this.client!.callTool({
            name: 'browser_navigate',
            arguments: { url: targetUrl }
          });
          const retryDuration = Date.now() - mainNavigateStartTime;
          console.log(`[Navigate ${runId}] ✅ 重试导航成功 (总耗时: ${retryDuration}ms)`);
        } catch (installError: any) {
          console.error(`[Navigate ${runId}] ❌ 浏览器安装失败:`, installError?.message);
          throw navigateError; // 抛出原始错误
        }
      } else {
        throw navigateError;
      }
    }

    // 标记浏览器已启动
    this.browserLaunched = true;
    console.log(`[Navigate ${runId}] browserLaunched 标志已设置为 true`);

    console.log(`[Navigate ${runId}] 验证当前页面状态...`);
    await this.verifyCurrentPageState(runId);
    console.log(`[Navigate ${runId}] 页面状态验证完成`);

    try {
      console.log(`[Navigate ${runId}] 等待网络空闲状态...`);
      const waitStartTime = Date.now();
      await this.client!.callTool({
        name: 'browser_wait_for',
        arguments: { state: 'networkidle' }
      });
      const waitDuration = Date.now() - waitStartTime;
      console.log(`[Navigate ${runId}] ✅ 网络空闲等待完成 (耗时: ${waitDuration}ms)`);

      console.log(`[Navigate ${runId}] 再次验证页面状态...`);
      await this.verifyCurrentPageState(runId);
    } catch (waitError: any) {
      console.warn(`[Navigate ${runId}] ⚠️  页面等待失败，继续执行`);
      console.warn(`[Navigate ${runId}] 等待错误:`, {
        message: waitError?.message,
        name: waitError?.name
      });
    }

    if (this.screenshotHandler) {
      const screenshotFilename = `navigate-${Date.now()}.png`;
      console.log(`[Navigate ${runId}] 拍摄截图: ${screenshotFilename}`);
      try {
        await this.screenshotHandler.takeScreenshot(screenshotFilename);
        console.log(`[Navigate ${runId}] ✅ 截图完成`);
      } catch (screenshotError: any) {
        console.warn(`[Navigate ${runId}] ⚠️  截图失败:`, screenshotError?.message);
      }
    } else {
      console.log(`[Navigate ${runId}] 跳过截图 (ScreenshotHandler 不存在)`);
    }

    console.log(`[Navigate ${runId}] 刷新快照...`);
    await this.refreshSnapshot();
    console.log(`[Navigate ${runId}] ✅ 快照已刷新`);

    const totalDuration = Date.now() - navigateStartTime;
    console.log(`[Navigate ${runId}] ========================================`);
    console.log(`[Navigate ${runId}] ✅ 导航操作完成 (总耗时: ${totalDuration}ms)`);
    console.log(`[Navigate ${runId}] ========================================`);
  }

  private async handleClickOrFill(step: TestStep, runId: string): Promise<void> {
    console.log(`🔍 [${runId}] 正在查找元素: ${step.selector}`);

    // 操作前确保页面完全加载
    await this.waitForLoad();

    const element = await this.findBestElement(step.selector!, runId);
    console.log(`✅ [${runId}] 找到目标元素: ${element.text} (ref: ${element.ref})`);

    // 确保元素可见并可交互
    try {
      console.log(`🔍 [${runId}] 验证元素可见性...`);
      await this.client!.callTool({
        name: this.getToolName('wait'),
        arguments: { ref: element.ref, state: 'visible', timeout: ELEMENT_READY_TIMEOUT }
      });
      console.log(`✅ [${runId}] 元素可见性验证通过`);
    } catch (visibilityError) {
      console.warn(`⚠️ [${runId}] 元素不可见，尝试直接操作...`);
    }

    const toolName = this.getToolName(step.action === 'click' ? 'click' : 'fill');
    const args = step.action === 'click'
      ? { ref: element.ref }
      : { ref: element.ref, text: step.value! };

    console.log(`🎯 [${runId}] 正在执行${step.action === 'click' ? '点击' : '输入'}操作...`);
    console.log(`📋 [${runId}] MCP参数:`, JSON.stringify(args, null, 2));

    try {
      await this.client!.callTool({ name: toolName, arguments: args });
      console.log(`✅ [${runId}] ${step.action === 'click' ? '点击' : '输入'}操作完成`);
    } catch (operationError) {
      console.error(`❌ [${runId}] 操作执行失败:`, operationError);
      // 重试一次
      console.log(`🔄 [${runId}] 正在重试操作...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.client!.callTool({ name: toolName, arguments: args });
      console.log(`✅ [${runId}] 重试操作成功`);
    }

    await this.refreshSnapshot();
    console.log(`📊 [${runId}] 操作后页面快照已更新`);
  }


  private async handleWait(step: TestStep, runId: string): Promise<void> {
    const waitTimeout = step.timeout || 3000;
    console.log(`⏱️ [${runId}] 开始等待 ${waitTimeout}ms...`);

    // 使用MCP的等待功能确保页面完全加载
    try {
      console.log(`⏳ [${runId}] 等待页面网络空闲...`);
      await this.client!.callTool({
        name: this.getToolName('wait'),
        arguments: { state: 'networkidle' }
      });
      console.log(`✅ [${runId}] 页面网络空闲完成`);
    } catch (networkError) {
      console.warn(`⚠️ [${runId}] 网络等待失败，使用固定等待时间: ${networkError}`);
      await new Promise(function (res) {
        setTimeout(res, waitTimeout);
      });
    }

    // 等待后刷新快照确保元素可见
    await this.refreshSnapshot();
    console.log(`✅ [${runId}] 等待完成，页面快照已更新`);
  }

  private async handleScroll(_runId: string): Promise<void> {
    await this.client!.callTool({
      name: this.getToolName('evaluate'),
      arguments: {
        script: 'window.scrollTo(0, document.body.scrollHeight);'
      }
    });
    await this.refreshSnapshot();
  }

  private async handleScreenshot(runId: string): Promise<void> {
    console.log(`📸 [${runId}] 正在截图...`);
    const filename = `screenshot-${Date.now()}.png`;
    if (this.screenshotHandler) {
      await this.screenshotHandler.takeScreenshot(filename);
      console.log(`✅ [${runId}] 截图完成: ${filename}`);
    }
  }

  // ========================================================================
  // Element Finding & Matching
  // ========================================================================

  private async findBestElement(selector: string, runId: string): Promise<ElementMatch> {
    if (!this.snapshot) {
      await this.refreshSnapshot();
    }
    if (!this.snapshot) {
      throw new Error(`Cannot get page snapshot (runId: ${runId})`);
    }

    try {
      const snapshotData = this.parseSnapshotForAI();
      const matchedElement = await this.aiMatchElement(selector, snapshotData);

      if (matchedElement) {
        console.log(`[ElementMatch ${runId}] ✅ 找到匹配元素: ref=${matchedElement.ref}, confidence=${matchedElement.confidence}, reasons=${matchedElement.reasons}`);
        return matchedElement;
      }

      // 🔥 改进：提供更详细的错误信息，包括页面上的可用元素
      const availableElements = snapshotData.elements.slice(0, 10).map(e =>
        `[ref=${e.ref}] ${e.role} "${e.texts.join(' ')}"`
      ).join(', ');
      const errorMsg = `AI cannot find matching element: "${selector}" (runId: ${runId}). Available elements (first 10): ${availableElements}`;
      console.error(`[ElementMatch ${runId}] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    } catch (parseError: any) {
      const errorMsg = `AI element location failed: ${parseError.message} (runId: ${runId})`;
      console.error(`[ElementMatch ${runId}] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  private parseSnapshotForAI(): SnapshotData {
    const elements: SnapshotData['elements'] = [];
    const lines = this.snapshot!.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);

      if (refMatch) {
        const ref = refMatch[1];
        const textMatches = trimmedLine.match(/"([^"]*)"/g) || [];
        const texts = textMatches.map(t => t.replace(/"/g, ''));

        let role = '';
        let type = '';

        if (trimmedLine.includes('textbox')) role = 'textbox';
        else if (trimmedLine.includes('button')) role = 'button';
        else if (trimmedLine.includes('checkbox')) role = 'checkbox';
        else if (trimmedLine.includes('link')) role = 'link';
        else if (trimmedLine.includes('input')) role = 'input';

        if (trimmedLine.includes('password')) type = 'password';
        else if (trimmedLine.includes('submit')) type = 'submit';

        elements.push({
          ref,
          texts,
          role,
          type,
          fullLine: trimmedLine
        });
      }
    }

    return {
      elements,
      pageInfo: this.extractPageInfo()
    };
  }

  private extractPageInfo(): SnapshotData['pageInfo'] {
    const urlMatch = this.snapshot!.match(/Page URL: ([^\n]+)/);
    const titleMatch = this.snapshot!.match(/Page Title: ([^\n]+)/);

    return {
      url: urlMatch ? urlMatch[1].trim() : '',
      title: titleMatch ? titleMatch[1].trim() : '',
      elementCount: (this.snapshot!.match(/\[ref=/g) || []).length
    };
  }

  private async aiMatchElement(
    selector: string,
    snapshotData: SnapshotData
  ): Promise<ElementMatch | null> {
    const { elements } = snapshotData;
    const selectorDesc = selector.toLowerCase();

    let bestMatch: ElementMatch | null = null;
    let bestConfidence = 0;

    for (const element of elements) {
      let confidence = 0;
      const elementText = element.texts.join(' ').toLowerCase();
      const reasons: string[] = [];

      // Username matching - 更精确的匹配逻辑
      const isUsernameQuery = selectorDesc.includes('账号') ||
        selectorDesc.includes('用户名') ||
        (selectorDesc.includes('user') && (selectorDesc.includes('name') || selectorDesc.includes('账号') || selectorDesc.includes('用户名')));

      if (isUsernameQuery) {
        if (elementText.includes('账号')) {
          confidence += 100;
          reasons.push('Contains "账号" keyword');
        }
        if (elementText.includes('用户名')) {
          confidence += 90;
          reasons.push('Contains "用户名" keyword');
        }
        if (elementText.includes('user') && (elementText.includes('name') || elementText.includes('账号') || elementText.includes('用户名'))) {
          confidence += 80;
          reasons.push('Contains "user" keyword with context');
        }
        // 只有在明确是用户名输入框时才给予textbox角色加分，且排除密码框
        if (element.role === 'textbox' && !elementText.includes('密码') && !elementText.includes('password') && element.type !== 'password') {
          confidence += 40;
          reasons.push('Is textbox without password hint');
        }
      }

      // Password matching
      if (selectorDesc.includes('密码') || selectorDesc.includes('password') || selectorDesc.includes('pass')) {
        if (elementText.includes('密码')) {
          confidence += 100;
          reasons.push('Contains "密码" keyword');
        }
        if (elementText.includes('password')) {
          confidence += 90;
          reasons.push('Contains "password" keyword');
        }
        if (element.type === 'password') {
          confidence += 60;
          reasons.push('Type is password');
        }
        if (element.role === 'textbox' && elementText.includes('密码')) {
          confidence += 50;
          reasons.push('Is textbox with password hint');
        }
      }

      // Login button matching - 更精确的匹配逻辑
      const isLoginButtonQuery = selectorDesc.includes('登录') ||
        selectorDesc.includes('登入') ||
        selectorDesc.includes('login') ||
        (selectorDesc.includes('submit') && (selectorDesc.includes('登录') || selectorDesc.includes('登入'))) ||
        (selectorDesc.includes('button') && (selectorDesc.includes('登录') || selectorDesc.includes('登入') || selectorDesc.includes('login')));

      if (isLoginButtonQuery) {
        if (elementText.includes('登录')) {
          confidence += 100;
          reasons.push('Contains "登录" keyword');
        }
        if (elementText.includes('登入')) {
          confidence += 100;
          reasons.push('Contains "登入" keyword');
        }
        if (elementText.includes('login')) {
          confidence += 80;
          reasons.push('Contains "login" keyword');
        }
        // 只有在明确提到登录相关关键词时才给予button角色加分
        if (element.role === 'button' && (elementText.includes('登录') || elementText.includes('登入') || elementText.includes('login'))) {
          confidence += 50;
          reasons.push('Is login button type');
        }
      }

      // 🔥 新增：菜单项匹配逻辑
      const isMenuQuery = selectorDesc.includes('菜单') ||
        selectorDesc.includes('导航栏') ||
        selectorDesc.includes('导航') ||
        selectorDesc.includes('menu') ||
        selectorDesc.includes('nav');

      if (isMenuQuery) {
        // 菜单项通常是button或link类型
        if (element.role === 'button' || element.role === 'link') {
          confidence += 40;
          reasons.push('Is button/link type (menu item)');
        }

        // 提取菜单项名称（如"测试"、"首页"等）
        const menuItemMatch = selectorDesc.match(/['"]([^'"]+)['"]|的([^的]+)选项|的([^的]+)菜单/);
        if (menuItemMatch) {
          const menuItemName = (menuItemMatch[1] || menuItemMatch[2] || menuItemMatch[3] || '').trim().toLowerCase();
          if (menuItemName && elementText.includes(menuItemName)) {
            confidence += 80; // 菜单项名称匹配给予高分
            reasons.push(`Menu item name matches: "${menuItemName}"`);
          }
        }

        // 位置描述匹配（底部菜单）
        if (selectorDesc.includes('底部') || selectorDesc.includes('bottom')) {
          // 注意：这里我们无法直接判断元素位置，但可以优先考虑button/link
          confidence += 20;
          reasons.push('Bottom menu indicator');
        }
      }

      // Keyword matching
      const selectorKeywords = selectorDesc.split(/\s+/).filter(k => k.length > 1);
      for (const keyword of selectorKeywords) {
        // 跳过常见的停用词
        if (['的', '中', '在', '点击', '选项', '菜单', '底部', '顶部'].includes(keyword)) {
          continue;
        }
        if (elementText.includes(keyword)) {
          confidence += 25;
          reasons.push(`Matches keyword "${keyword}"`);
        }
      }

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = {
          ref: element.ref,
          text: element.texts[0] || '',
          confidence,
          reasons: reasons.join(', ')
        };
      }
    }

    if (bestMatch && bestConfidence >= MIN_CONFIDENCE_THRESHOLD) {
      return bestMatch;
    }

    if (bestMatch && bestConfidence > FALLBACK_CONFIDENCE_THRESHOLD) {
      return bestMatch;
    }

    // Fallback strategies - 更严格的fallback逻辑
    const fallback = elements.find(
      e => {
        const eTexts = e.texts.join(' ').toLowerCase();
        return (
          (selectorDesc.includes('账号') && e.role === 'textbox' && e.texts.some(t => t.includes('账号'))) ||
          (selectorDesc.includes('用户名') && e.role === 'textbox' && e.texts.some(t => t.includes('用户名'))) ||
          (selectorDesc.includes('密码') && e.role === 'textbox' && (e.type === 'password' || e.texts.some(t => t.includes('密码')))) ||
          ((selectorDesc.includes('登录') || selectorDesc.includes('登入')) && e.role === 'button' && e.texts.some(t => t.includes('登录') || t.includes('登入'))) ||
          // 🔥 新增：菜单项fallback匹配
          ((selectorDesc.includes('菜单') || selectorDesc.includes('导航')) &&
            (e.role === 'button' || e.role === 'link') &&
            (() => {
              const menuItemMatch = selectorDesc.match(/['"]([^'"]+)['"]|的([^的]+)选项|的([^的]+)菜单/);
              if (menuItemMatch) {
                const menuItemName = (menuItemMatch[1] || menuItemMatch[2] || menuItemMatch[3] || '').trim().toLowerCase();
                return menuItemName && eTexts.includes(menuItemName);
              }
              return false;
            })())
        );
      }
    );

    if (fallback) {
      return { ref: fallback.ref, text: fallback.texts[0] || '' };
    }

    // 🔥 修复：不再返回第一个元素作为默认选择，避免匹配错误
    // 如果找不到匹配的元素，返回null让调用者处理错误
    return null;
  }

  // ========================================================================
  // Snapshot Management
  // ========================================================================

  private async refreshSnapshot(): Promise<void> {
    const refreshStartTime = Date.now();
    console.log('[Snapshot] 开始刷新快照...');
    const maxRetries = MAX_RETRIES;
    let lastError: any;

    for (let retry = 1; retry <= maxRetries; retry++) {
      try {
        if (retry > 1) {
          console.log(`[Snapshot] 重试 ${retry}/${maxRetries}，等待 DOM 稳定...`);
          await this.waitForDOMStable(1);
        }

        console.log(`[Snapshot] 获取快照 (尝试 ${retry}/${maxRetries})...`);
        const snapshotResult = await this.getSnapshot();
        // 提取字符串用于存储
        const yaml = this.extractSnapshotString(snapshotResult);
        this.snapshot = yaml;
        const refreshDuration = Date.now() - refreshStartTime;
        const snapshotLength = yaml?.length || 0;
        console.log(`[Snapshot] ✅ 快照刷新成功 (耗时: ${refreshDuration}ms, 长度: ${snapshotLength} 字符)`);
        return;
      } catch (error: any) {
        lastError = error;
        console.warn(`[Snapshot] ⚠️  快照刷新失败 (尝试 ${retry}/${maxRetries}):`, {
          message: error.message,
          name: error.name
        });

        if (
          error.message?.includes('getComputedStyle') ||
          error.message?.includes('Element') ||
          retry < maxRetries
        ) {
          const delay = retry * 1000;
          console.log(`[Snapshot] 等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    const refreshDuration = Date.now() - refreshStartTime;
    console.error(`[Snapshot] ❌ 快照刷新失败 (总耗时: ${refreshDuration}ms)`);
    throw new Error(`Snapshot refresh failed: ${lastError?.message}`);
  }

  /**
   * 获取MCP原始快照响应对象
   * @returns MCP原始响应对象
   */
  async getSnapshot(): Promise<any> {
    if (!this.isInitialized || !this.client) {
      throw new Error('MCP_DISCONNECTED: Client is not connected.');
    }
    try {
      console.log(`📊 正在获取MCP页面快照...`);

      // 🔥 获取MCP原始快照返回
      const snapshotResult: any = await this.client.callTool({ name: this.getToolName('snapshot'), arguments: { random_string: 'test' } });

      console.log(`📊 MCP原始快照返回:`, JSON.stringify(snapshotResult, null, 2));

      // 验证响应是否有效
      if (!snapshotResult) {
        console.error('❌ mcp_playwright_browser_snapshot 没返回可用数据, 实际返回:', snapshotResult);

        // 🔥 尝试截图作为备用方案
        try {
          await this.client.callTool({ name: this.getToolName('screenshot'), arguments: { filename: 'debug-snapshot.png' } });
          console.log('📸 已保存调试截图: debug-snapshot.png');
        } catch (screenshotError) {
          console.warn('⚠️ 截图也失败了:', screenshotError);
        }

        throw new Error('mcp_playwright_browser_snapshot 没返回可用数据');
      }

      // 提取字符串用于调试和统计
      const yaml = this.extractSnapshotString(snapshotResult);
      if (yaml) {
        // 🔥 增强调试：显示快照内容预览
        const lines = yaml.split('\n');
        console.log(`📊 MCP页面快照已获取 (${lines.length} 行)`);

        // 显示前20行用于调试
        const previewLines = lines.slice(0, 20);
        console.log(`📊 快照预览:\n${previewLines.join('\n')}`);

        // 🔥 统计元素类型
        const elementTypes = ['textbox', 'button', 'link', 'input', 'checkbox', 'radio', 'combobox'];
        const foundTypes: string[] = [];
        elementTypes.forEach(type => {
          const count = (yaml.match(new RegExp(type, 'g')) || []).length;
          if (count > 0) foundTypes.push(`${type}(${count})`);
        });

        if (foundTypes.length > 0) {
          console.log(`📊 发现元素类型: ${foundTypes.join(', ')}`);
        } else {
          console.log(`⚠️ 未在快照中发现常见交互元素`);
        }

        // 存储字符串快照用于向后兼容
        this.snapshot = yaml;
      }

      // 返回原始MCP响应对象
      return snapshotResult;

    } catch (error: any) {
      console.error('📛 mcp_playwright_browser_snapshot 调用异常 >>>', error);
      this.snapshot = null;
      throw new Error(`获取MCP快照失败: ${error?.message || error}`);
    }
  }

  /**
   * 从MCP原始响应中提取快照字符串（用于向后兼容）
   * @param snapshotResult MCP原始响应对象
   * @returns 快照字符串，如果无法提取则返回null
   */
  private extractSnapshotString(snapshotResult: any): string | null {
    if (!snapshotResult) return null;

    let yaml: string | undefined = undefined;

    if (snapshotResult?.snapshot?.body) {
      yaml = String(snapshotResult.snapshot.body);
    } else if (snapshotResult?.snapshot) {
      yaml = String(snapshotResult.snapshot);
    } else if (snapshotResult?.content?.[0]?.text) {
      yaml = String(snapshotResult.content[0].text);
    } else if (snapshotResult?.content?.text) {
      yaml = String(snapshotResult.content.text);
    }

    return yaml && typeof yaml === 'string' ? yaml : null;
  }

  /**
   * 获取快照字符串（向后兼容方法）
   * @returns 快照字符串
   */
  async getSnapshotString(): Promise<string> {
    const snapshotResult = await this.getSnapshot();
    const yaml = this.extractSnapshotString(snapshotResult);

    if (!yaml) {
      throw new Error('无法从MCP响应中提取快照字符串');
    }

    return yaml;
  }

  // ========================================================================
  // Screenshot Management
  // ========================================================================

  async takeScreenshot(filename: string): Promise<void> {
    if (this.screenshotHandler) {
      await this.screenshotHandler.takeScreenshot(filename);
    }
  }

  async takeScreenshotForStream(
    options: { runId?: string; filename?: string } = {}
  ): Promise<{ buffer: Buffer; source: 'mcp-direct' | 'filesystem'; durationMs: number }> {
    if (!this.screenshotHandler) {
      throw new Error('MCP client not initialized');
    }
    return this.screenshotHandler.takeScreenshotForStream(options);
  }

  // ========================================================================
  // Page State Management
  // ========================================================================

  async waitForLoad(isFirstStep: boolean = false): Promise<void> {
    if (!this.isInitialized || !this.client) return;
    try {
      // 🔥 优化：第一步导航使用快速模式，避免长时间等待
      if (isFirstStep) {
        console.log('⚡ 第一步导航：使用快速等待模式...');
        // 只等待基本的页面就绪，不等待网络空闲
        try {
          await Promise.race([
            this.client.callTool({
              name: this.useAlternativeToolNames ? 'browser_wait' : 'mcp_playwright_browser_wait',
              arguments: { state: 'domcontentloaded' }
            }),
            new Promise<void>((resolve) => setTimeout(resolve, 2000)) // 最多等待2秒
          ]);
        } catch (error) {
          console.log('⚡ 第一步快速等待超时，直接继续');
        }
        console.log('✅ 第一步快速等待完成');
        return;
      }

      // 🚀 非第一步：使用完整的页面稳定性等待
      console.log('⏳ 开始等待页面完全稳定...');

      // 1. 等待网络空闲
      await this.client.callTool({
        name: this.useAlternativeToolNames ? 'browser_wait' : 'mcp_playwright_browser_wait',
        arguments: { state: 'networkidle' }
      });

      // 2. 等待DOM稳定（防止动态修改导致getComputedStyle错误）
      await this.waitForDOMStable();

      console.log('✅ 页面已完全稳定');
    } catch (error) {
      console.warn('⚠️ 等待页面加载失败，继续执行:', error);
    }
  }

  // 🚀 新增：等待DOM稳定，防止getComputedStyle错误
  private async waitForDOMStable(maxAttempts: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`🔍 DOM稳定性检查 (${attempt}/${maxAttempts})...`);

        // 等待一小段时间让动态内容完成加载
        await new Promise(resolve => setTimeout(resolve, DOM_STABLE_CHECK_DELAY));

        // 检查页面是否还在加载
        const isStable = await this.client!.callTool({
          name: 'browser_evaluate',
          arguments: {
            function: `() => {
              // 检查页面是否有正在进行的动画或异步加载
              return document.readyState === 'complete' && 
                     !document.querySelector('[loading], .loading, .spinner') &&
                     !window.requestAnimationFrame.toString().includes('native');
            }`
          }
        });

        const stableContent = (isStable as any)?.content;
        const stableContentArray = Array.isArray(stableContent) ? stableContent : stableContent ? [stableContent] : [];
        const firstStableContent = stableContentArray[0];
        if (firstStableContent && typeof firstStableContent === 'object' && 'text' in firstStableContent && firstStableContent.text === 'true') {
          console.log('✅ DOM已稳定');
          return;
        }

        console.log(`⚠️ DOM尚未稳定，等待重试...`);
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.warn(`⚠️ DOM稳定性检查失败 (${attempt}/${maxAttempts}):`, error);
        if (attempt === maxAttempts) {
          console.log('⚠️ DOM稳定性检查超时，继续执行');
        }
      }
    }
  }

  // 🚀 修复Bug：实现缺失的页面完全加载等待方法
  async waitForPageFullyLoaded(): Promise<void> {
    if (!this.isInitialized || !this.client) return;

    try {
      console.log('⏳ 等待页面完全加载...');

      // 1. 等待页面基本加载完成
      await this.client.callTool({
        name: this.useAlternativeToolNames ? 'browser_wait' : 'mcp_playwright_browser_wait',
        arguments: { state: 'domcontentloaded' }
      });

      // 2. 等待网络请求完成
      await this.client.callTool({
        name: this.useAlternativeToolNames ? 'browser_wait' : 'mcp_playwright_browser_wait',
        arguments: { state: 'networkidle' }
      });

      // 3. 额外等待，确保动态内容加载完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('✅ 页面完全加载完成');
    } catch (error) {
      console.warn('⚠️ 页面完全加载等待失败:', error);
      // 降级：简单等待
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 🚀 修复Bug：实现缺失的页面稳定性检查方法
  async waitForPageStability(): Promise<void> {
    if (!this.isInitialized || !this.client) return;

    try {
      console.log('⏳ 检查页面稳定性...');

      // 检查页面URL是否稳定（防止重定向中断）
      let previousUrl = await this.getCurrentUrl();
      await new Promise(resolve => setTimeout(resolve, 500));
      let currentUrl = await this.getCurrentUrl();

      // 如果URL还在变化，继续等待
      if (previousUrl !== currentUrl) {
        console.log(`🔄 页面正在跳转: ${previousUrl} → ${currentUrl}`);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 再次检查
        currentUrl = await this.getCurrentUrl();
        console.log(`✅ 页面跳转完成: ${currentUrl}`);
      }

      // 等待DOM稳定
      await this.waitForDOMStable(2);

      console.log('✅ 页面稳定性检查完成');
    } catch (error) {
      console.warn('⚠️ 页面稳定性检查失败:', error);
      // 降级：固定等待
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // 🚀 新增：等待元素准备就绪，防止操作失败
  private async waitForElementReady(ref: string, runId: string): Promise<void> {
    if (!ref) return;

    try {
      console.log(`🎯 [${runId}] 检查元素是否准备就绪: ${ref}`);

      // 使用browser_wait_for确保元素可见且可交互
      await this.client!.callTool({
        name: this.getToolName('wait'),
        arguments: {
          ref: ref,
          state: 'visible',
          timeout: 5000
        }
      });

      // 额外等待确保元素完全稳定
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log(`✅ [${runId}] 元素已准备就绪: ${ref}`);

    } catch (error) {
      console.warn(`⚠️ [${runId}] 元素准备检查失败: ${ref}`, error);
      // 不抛出错误，让后续操作继续尝试
    }
  }

  async getCurrentUrl(): Promise<string> {
    if (!this.isInitialized || !this.client) return '';

    try {
      // 🔥 修复：使用正确的browser_evaluate工具和function参数格式
      const result = await this.client.callTool({
        name: 'browser_evaluate',
        arguments: {
          function: '() => window.location.href'
        }
      });

      // 解析结果
      if (result && (result as any).content) {
        const content = Array.isArray((result as any).content) ? (result as any).content : [(result as any).content];
        for (const item of content) {
          if (item && item.type === 'text' && item.text) {
            // 提取URL
            const urlMatch = item.text.match(/https?:\/\/[^\s]+/) || item.text.match(/^[^\s]+$/);
            if (urlMatch) {
              console.log(`🔍 当前页面URL: ${urlMatch[0]}`);
              return urlMatch[0];
            }
          }
        }
      }

      console.warn('⚠️ 无法从browser_evaluate结果中提取URL');
      return '';
    } catch (error: any) {
      console.warn(`⚠️ getCurrentUrl失败: ${error.message}`);
      return '';
    }
  }

  async getContextState(): Promise<any> {
    if (!this.isInitialized || !this.client) return null;
    try {
      return await this.client.callTool({
        name: this.getToolName('get_context_state'),
        arguments: {}
      });
    } catch (error) {
      console.error('Failed to get context state:', error);
      return null;
    }
  }

  async setContextState(contextState: any): Promise<void> {
    if (!this.isInitialized || !this.client) return;
    try {
      await this.client.callTool({
        name: this.getToolName('set_context_state'),
        arguments: { contextState }
      });
      console.log('Context state restored');
    } catch (error) {
      console.error('Failed to set context state:', error);
    }
  }

  /**
   * 🔥 新增：验证输入框的值是否已正确设置
   */
  private async verifyInputValue(ref: string, expectedText: string, runId: string): Promise<{ success: boolean; error?: string; actualValue?: string }> {
    try {
      if (!this.client || !this.isInitialized) {
        return { success: false, error: 'MCP客户端未初始化' };
      }

      // 首先刷新快照以获取最新的元素信息
      await this.refreshSnapshot();
      const snapshotData = this.parseSnapshotForAI();
      const element = snapshotData.elements.find(e => e.ref === ref);

      if (!element) {
        console.warn(`[${runId}] ⚠️ 在快照中未找到元素ref: ${ref}`);
      }

      // 🔥 主要方法: 使用 browser_evaluate 获取输入框值（最可靠的方法）
      try {

        // 使用 browser_evaluate 获取输入框值
        const evaluateResult = await this.client.callTool({
          name: 'browser_evaluate',
          arguments: {
            function: `() => {
              // 尝试多种方式查找元素
              const ref = "${ref}";
              let element = null;
              
              // 方法1: 通过data-ref属性查找
              element = document.querySelector('[data-ref="' + ref + '"]');
              
              // 方法2: 通过ref属性查找
              if (!element) {
                element = document.querySelector('[ref="' + ref + '"]');
              }
              
              // 方法3: 通过id包含ref查找
              if (!element) {
                const allInputs = document.querySelectorAll('input, textarea');
                for (let i = 0; i < allInputs.length; i++) {
                  const input = allInputs[i];
                  if (input.id && input.id.includes(ref)) {
                    element = input;
                    break;
                  }
                }
              }
              
              // 方法4: 通过name属性查找
              if (!element) {
                const allInputs = document.querySelectorAll('input, textarea');
                for (let i = 0; i < allInputs.length; i++) {
                  const input = allInputs[i];
                  if (input.name && input.name.includes(ref)) {
                    element = input;
                    break;
                  }
                }
              }
              
              // 如果找到元素，返回其值
              if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
                return element.value || '';
              }
              
              return null;
            }`
          }
        });

        if (evaluateResult && evaluateResult.content) {
          const content = Array.isArray(evaluateResult.content) ? evaluateResult.content : [evaluateResult.content];
          for (const item of content) {
            if (item && typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item) {
              const actualValue = String(item.text || '').trim();
              console.log(`🔍 [${runId}] 输入框实际值: "${actualValue}", 期望值: "${expectedText}"`);

              // 检查是否是密码框（通过快照中的元素信息）
              const isPasswordField = element && element.type === 'password';

              // 对于密码框，只验证长度
              if (isPasswordField) {
                const actualLength = actualValue.length;
                const expectedLength = expectedText.length;
                console.log(`🔍 [${runId}] 密码输入框长度验证: 实际=${actualLength}, 期望=${expectedLength}`);
                if (actualLength === expectedLength && actualLength > 0) {
                  return { success: true, actualValue: '***' };
                } else {
                  return { success: false, error: `密码长度不匹配: 实际长度=${actualLength}, 期望长度=${expectedLength}` };
                }
              }

              // 对于普通输入框，验证完整值
              if (actualValue === expectedText || actualValue.includes(expectedText) || expectedText.includes(actualValue)) {
                return { success: true, actualValue };
              } else {
                return { success: false, error: `值不匹配: 实际="${actualValue}", 期望="${expectedText}"`, actualValue };
              }
            }
          }
        }

        // 如果browser_evaluate返回null，说明元素未找到或值未设置
        console.warn(`[${runId}] browser_evaluate返回null，可能元素未找到或值未设置`);

      } catch (evalError: any) {
        // 🔥 修复：确保错误消息不会被当作实际值
        const errorMsg = evalError.message || String(evalError);
        console.warn(`[${runId}] browser_evaluate验证失败: ${errorMsg}`);

        // 如果错误是因为工具不存在，跳过验证（向后兼容）
        if (errorMsg.includes('not found') || errorMsg.includes('Tool')) {
          console.warn(`[${runId}] ⚠️ browser_evaluate工具不可用，跳过验证（向后兼容）`);
          return { success: true, error: '验证工具不可用，假设输入成功' };
        }
      }

      // 备用方法: 从快照中提取输入框的值（如果browser_evaluate失败）
      if (element) {
        const elementLine = element.fullLine;
        // 查找快照中可能包含的值信息
        const valueMatch = elementLine.match(/value[=:]\s*"([^"]*)"/i) ||
          elementLine.match(/输入[：:]\s*"([^"]*)"/i);

        if (valueMatch) {
          const actualValue = valueMatch[1].trim();
          console.log(`🔍 [${runId}] 从快照提取的输入框值: "${actualValue}", 期望值: "${expectedText}"`);

          // 对于密码框，快照中通常不包含值，跳过
          if (element.type === 'password') {
            console.log(`🔍 [${runId}] 密码输入框，快照中不包含值，假设输入成功`);
            return { success: true, actualValue: '***' };
          }

          if (actualValue === expectedText || actualValue.includes(expectedText) || expectedText.includes(actualValue)) {
            return { success: true, actualValue };
          } else {
            return { success: false, error: `值不匹配: 实际="${actualValue}", 期望="${expectedText}"`, actualValue };
          }
        }

        // 如果是密码框且快照中没有值，假设输入成功（密码值不会显示在快照中）
        if (element.type === 'password' && expectedText.length > 0) {
          console.log(`🔍 [${runId}] 密码输入框，无法从快照验证，假设输入成功`);
          return { success: true, actualValue: '***' };
        }
      }

      // 🔥 修复：如果所有验证方法都失败，返回失败而不是成功
      console.error(`[${runId}] ❌ 无法验证输入框值，所有验证方法都失败，元素ref: ${ref}`);
      return { success: false, error: `无法验证输入框值: 元素ref=${ref}, 期望值="${expectedText}"` };

    } catch (error: any) {
      console.error(`[${runId}] 验证输入框值失败:`, error);
      return { success: false, error: error.message };
    }
  }

  private async verifyCurrentPageState(runId: string): Promise<void> {
    try {
      try {
        await this.getCurrentUrl();
        const titleResult = await this.client!.callTool({
          name: 'browser_evaluate',
          arguments: {
            function: '() => document.title'
          }
        });

        if (titleResult && titleResult.content) {
          const content = Array.isArray(titleResult.content) ? titleResult.content : [titleResult.content];
          for (const item of content) {
            if (item && typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item && item.text) {
              break;
            }
          }
        }
      } catch (evalError: any) {
        if (
          evalError.message?.includes('No open pages') ||
          evalError.message?.includes('navigate to a page first')
        ) {
          return;
        }
      }

      try {
        await this.refreshSnapshot();
      } catch (snapshotError: any) {
        if (!snapshotError.message?.includes('No open pages')) {
          console.warn(`Failed to refresh snapshot: ${snapshotError.message}`);
        }
      }
    } catch (error: any) {
      if (
        error.message?.includes('No open pages') ||
        error.message?.includes('navigate to a page first')
      ) {
        return;
      }
      console.error(`[${runId}] Page state verification failed:`, error);
    }
  }
}
