import { Request, Response } from 'express';
import { prdService } from '../../db/services/prdService.js';
import { PRDParser } from '../../core/parser/prdParser.js';

/**
 * 获取所有 PRD
 */
export async function getAllPRDs(req: Request, res: Response): Promise<void> {
  try {
    const prds = await prdService.getAllPRDs();
    res.json({
      success: true,
      data: prds,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '获取 PRD 列表失败',
    });
  }
}

/**
 * 根据ID获取 PRD
 */
export async function getPRDById(req: Request, res: Response): Promise<void> {
  try {
    const { prdId } = req.params;
    if (!prdId) {
      res.status(400).json({
        success: false,
        error: 'PRD ID 不能为空',
      });
      return;
    }

    const prd = await prdService.getPRDById(prdId);
    if (!prd) {
      res.status(404).json({
        success: false,
        error: 'PRD 不存在',
      });
      return;
    }

    res.json({
      success: true,
      data: prd,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '获取 PRD 失败',
    });
  }
}

/**
 * 创建或更新 PRD
 */
export async function upsertPRD(req: Request, res: Response): Promise<void> {
  try {
    const { title, description, content, version, status, author, prdId } = req.body;

    if (!title || !content) {
      res.status(400).json({
        success: false,
        error: 'PRD 标题和内容不能为空',
      });
      return;
    }

    const parser = new PRDParser();
    const prd = await parser.parseContent(content);
    
    // 使用请求中的字段覆盖解析结果
    if (title) prd.title = title;
    if (description) prd.description = description;
    if (version) prd.version = version;
    if (status) prd.status = status;
    if (author) prd.author = author;
    if (prdId) prd.prdId = prdId;

    const result = await prdService.upsertPRD(prd);
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '保存 PRD 失败',
    });
  }
}

/**
 * 删除 PRD
 */
export async function deletePRD(req: Request, res: Response): Promise<void> {
  try {
    const { prdId } = req.params;
    if (!prdId) {
      res.status(400).json({
        success: false,
        error: 'PRD ID 不能为空',
      });
      return;
    }

    await prdService.deletePRD(prdId);
    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '删除 PRD 失败',
    });
  }
}

/**
 * 从 PRD 生成测试用例
 */
export async function generateTestCasesFromPRD(req: Request, res: Response): Promise<void> {
  try {
    const { prdId } = req.params;
    const { saveToDatabase = true } = req.body;

    if (!prdId) {
      res.status(400).json({
        success: false,
        error: 'PRD ID 不能为空',
      });
      return;
    }

    // 异步生成测试用例（可能需要较长时间）
    const testCases = await prdService.generateTestCasesFromPRD(prdId, saveToDatabase);

    res.json({
      success: true,
      data: {
        prdId,
        testCases,
        count: testCases.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '生成测试用例失败',
    });
  }
}

/**
 * 获取 PRD 生成的测试用例
 */
export async function getGeneratedTestCases(req: Request, res: Response): Promise<void> {
  try {
    const { prdId } = req.params;

    if (!prdId) {
      res.status(400).json({
        success: false,
        error: 'PRD ID 不能为空',
      });
      return;
    }

    const testCases = await prdService.getGeneratedTestCases(prdId);

    res.json({
      success: true,
      data: testCases,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '获取生成的测试用例失败',
    });
  }
}

/**
 * 导出PRD为Markdown文件
 * GET /api/v1/prds/:prdId/export
 */
export async function exportPRDAsMarkdown(req: Request, res: Response): Promise<void> {
  try {
    const { prdId } = req.params;
    if (!prdId) {
      res.status(400).json({
        success: false,
        error: 'PRD ID 不能为空',
      });
      return;
    }

    const prd = await prdService.getPRDById(prdId);
    if (!prd) {
      res.status(404).json({
        success: false,
        error: 'PRD 不存在',
      });
      return;
    }

    const fileName = prd.title 
      ? `${prd.title.replace(/[^\w\s-]/g, '')}.md`
      : `PRD-${prdId}.md`;

    // 设置响应头，让浏览器下载文件
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(prd.content);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '导出失败',
    });
  }
}

/**
 * 从文件上传并解析 PRD（支持 multipart/form-data）
 */
export async function uploadPRDFile(req: Request, res: Response): Promise<void> {
  try {
    const file = (req as any).file;
    
    if (!file) {
      res.status(400).json({
        success: false,
        error: '请上传 PRD 文件',
      });
      return;
    }

    // 检查文件类型
    const fileName = file.originalname.toLowerCase();
    if (!fileName.endsWith('.md') && !fileName.endsWith('.markdown')) {
      res.status(400).json({
        success: false,
        error: '文件必须是 .md 或 .markdown 格式',
      });
      return;
    }

    // 将文件内容转换为字符串
    const content = file.buffer.toString('utf-8');

    // 解析并保存 PRD
    const prd = await prdService.parseAndSavePRDFromContent(content);
    
    res.json({
      success: true,
      data: prd,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '上传并解析 PRD 失败',
    });
  }
}

