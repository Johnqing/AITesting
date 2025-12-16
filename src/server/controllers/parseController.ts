import { Request, Response } from 'express';
import { TestService } from '../testService.js';
import { CaseParser } from '../../core/parser/caseParser.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * 解析测试用例文件
 */
export async function parseFile(req: Request, res: Response): Promise<void> {
  try {
    const { filePath, caseDir } = req.body;

    if (!filePath) {
      res.status(400).json({ error: 'filePath is required' });
      return;
    }

    const service = new TestService(caseDir || 'case');
    const caseFile = await service.parseFile(filePath);

    res.json({
      success: true,
      data: {
        filePath: caseFile.filePath,
        module: caseFile.module,
        entryUrl: caseFile.entryUrl,
        testCases: caseFile.testCases.map(tc => ({
          id: tc.id,
          title: tc.title,
          module: tc.module,
          priority: tc.priority,
          testType: tc.testType,
          preconditions: tc.preconditions,
          steps: tc.steps,
          expectedResults: tc.expectedResults,
          entryUrl: tc.entryUrl
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 解析测试用例字符串
 */
export async function parseString(req: Request, res: Response): Promise<void> {
  try {
    const { content, virtualFilePath } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const parser = new CaseParser('', true);
    const caseFile = await parser.parseFileContent(content, virtualFilePath || 'inline-case.md');

    res.json({
      success: true,
      data: {
        filePath: caseFile.filePath,
        module: caseFile.module,
        entryUrl: caseFile.entryUrl,
        testCases: caseFile.testCases.map(tc => ({
          id: tc.id,
          title: tc.title,
          module: tc.module,
          priority: tc.priority,
          testType: tc.testType,
          preconditions: tc.preconditions,
          steps: tc.steps,
          expectedResults: tc.expectedResults,
          entryUrl: tc.entryUrl
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 解析目录下所有测试用例文件
 */
export async function parseDirectory(req: Request, res: Response): Promise<void> {
  try {
    const { dirPath, caseDir } = req.body;
    const targetDir = dirPath || caseDir || 'case';

    const service = new TestService(targetDir);
    const caseFiles = await service.parseDirectory();

    res.json({
      success: true,
      data: caseFiles.map(cf => ({
        filePath: cf.filePath,
        module: cf.module,
        entryUrl: cf.entryUrl,
        testCaseCount: cf.testCases.length
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 上传并解析 XMind 文件
 */
export async function parseXmindFile(req: Request, res: Response): Promise<void> {
  try {
    const file = (req as any).file;
    
    if (!file) {
      res.status(400).json({
        success: false,
        error: '请上传 XMind 文件'
      });
      return;
    }

    // 检查文件类型
    if (!file.originalname.toLowerCase().endsWith('.xmind')) {
      res.status(400).json({
        success: false,
        error: '文件必须是 .xmind 格式'
      });
      return;
    }

    // 保存临时文件
    const tempDir = join(process.cwd(), 'temp');
    const tempFileName = `${randomUUID()}.xmind`;
    const tempFilePath = join(tempDir, tempFileName);
    
    try {
      // 确保 temp 目录存在
      const { mkdirSync } = await import('fs');
      try {
        mkdirSync(tempDir, { recursive: true });
      } catch (e) {
        // 目录可能已存在
      }

      writeFileSync(tempFilePath, file.buffer);

      // 解析 XMind 文件
      const parser = new CaseParser('', false);
      const caseFile = await parser.parseFile(tempFilePath);

      // 删除临时文件
      try {
        unlinkSync(tempFilePath);
      } catch (e) {
        // 忽略删除错误
      }

      res.json({
        success: true,
        data: {
          filePath: file.originalname,
          module: caseFile.module,
          entryUrl: caseFile.entryUrl,
          testCases: caseFile.testCases.map(tc => ({
            id: tc.id,
            title: tc.title,
            module: tc.module,
            priority: tc.priority,
            testType: tc.testType,
            preconditions: tc.preconditions,
            steps: tc.steps,
            expectedResults: tc.expectedResults,
            entryUrl: tc.entryUrl
          }))
        }
      });
    } catch (error) {
      // 确保删除临时文件
      try {
        unlinkSync(tempFilePath);
      } catch (e) {
        // 忽略删除错误
      }
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

