import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { TestReport, TestResult } from '../types/result.js';
import { formatDateTime, formatDateTimeForFilename } from '../utils/date.js';

export class Reporter {
  private outputDir: string;

  constructor(outputDir: string = 'reports') {
    this.outputDir = outputDir;
    // 确保输出目录存在
    try {
      mkdirSync(this.outputDir, { recursive: true });
    } catch (error) {
      // 目录可能已存在，忽略错误
    }
  }

  /**
   * 生成测试报告
   */
  generateReport(results: TestResult[]): TestReport {
    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const startTime = results.length > 0
      ? new Date(Math.min(...results.map(r => r.startTime.getTime())))
      : new Date();
    const endTime = results.length > 0
      ? new Date(Math.max(...results.map(r => r.endTime.getTime())))
      : new Date();

    return {
      total: results.length,
      passed,
      failed,
      duration: totalDuration,
      startTime,
      endTime,
      results
    };
  }

  /**
   * 生成 Markdown 格式报告
   */
  generateMarkdownReport(report: TestReport): string {
    const lines: string[] = [];

    lines.push('# 测试执行报告\n');
    lines.push(`**执行时间**: ${formatDateTime(report.startTime)} - ${formatDateTime(report.endTime)}`);
    lines.push(`**总耗时**: ${(report.duration / 1000).toFixed(2)} 秒\n`);
    lines.push('## 测试概览\n');
    lines.push(`- **总计**: ${report.total} 个测试用例`);
    lines.push(`- **通过**: ${report.passed} 个`);
    lines.push(`- **失败**: ${report.failed} 个`);
    lines.push(`- **通过率**: ${report.total > 0 ? ((report.passed / report.total) * 100).toFixed(2) : 0}%\n`);

    lines.push('## 详细结果\n');

    report.results.forEach((result, index) => {
      const status = result.success ? '✅ 通过' : '❌ 失败';
      lines.push(`### ${index + 1}. ${result.testCase.id} - ${result.testCase.title}`);
      lines.push(`**状态**: ${status}`);
      lines.push(`**功能模块**: ${result.testCase.module}`);
      lines.push(`**优先级**: ${result.testCase.priority}`);
      lines.push(`**测试类型**: ${result.testCase.testType}`);
      lines.push(`**执行时间**: ${(result.duration / 1000).toFixed(2)} 秒\n`);

      if (result.error) {
        lines.push(`**错误信息**: ${result.error}\n`);
      }

      lines.push('#### 操作执行详情\n');
      result.actionResults.forEach((ar, arIndex) => {
        const arStatus = ar.result.success ? '✅' : '❌';
        lines.push(`${arIndex + 1}. ${arStatus} **${ar.action.type}**: ${ar.action.description}`);
        if (ar.result.message) {
          lines.push(`   - ${ar.result.message}`);
        }
        if (ar.result.error) {
          lines.push(`   - 错误: ${ar.result.error}`);
        }
        lines.push('');
      });

      lines.push('---\n');
    });

    return lines.join('\n');
  }

  /**
   * 生成 JSON 格式报告
   */
  generateJSONReport(report: TestReport): string {
    // 将 Date 对象转换为格式化的时间字符串
    const reportWithFormattedDates = {
      ...report,
      startTime: formatDateTime(report.startTime),
      endTime: formatDateTime(report.endTime),
      results: report.results.map(result => ({
        ...result,
        startTime: formatDateTime(result.startTime),
        endTime: formatDateTime(result.endTime),
        actionResults: result.actionResults.map(ar => ({
          ...ar,
          timestamp: formatDateTime(ar.timestamp)
        }))
      }))
    };
    return JSON.stringify(reportWithFormattedDates, null, 2);
  }

  /**
   * 保存报告到文件
   */
  saveReport(report: TestReport, format: 'markdown' | 'json' | 'both' = 'both'): void {
    const timestamp = formatDateTimeForFilename();

    if (format === 'markdown' || format === 'both') {
      const markdown = this.generateMarkdownReport(report);
      const markdownPath = join(this.outputDir, `report-${timestamp}.md`);
      writeFileSync(markdownPath, markdown, 'utf-8');
      console.log(`Markdown report saved to: ${markdownPath}`);
    }

    if (format === 'json' || format === 'both') {
      const json = this.generateJSONReport(report);
      const jsonPath = join(this.outputDir, `report-${timestamp}.json`);
      writeFileSync(jsonPath, json, 'utf-8');
      console.log(`JSON report saved to: ${jsonPath}`);
    }
  }

  /**
   * 在控制台输出报告摘要
   */
  printSummary(report: TestReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('测试执行摘要');
    console.log('='.repeat(60));
    console.log(`总计: ${report.total} 个测试用例`);
    console.log(`通过: ${report.passed} 个`);
    console.log(`失败: ${report.failed} 个`);
    console.log(`通过率: ${report.total > 0 ? ((report.passed / report.total) * 100).toFixed(2) : 0}%`);
    console.log(`总耗时: ${(report.duration / 1000).toFixed(2)} 秒`);
    console.log('='.repeat(60) + '\n');

    if (report.failed > 0) {
      console.log('失败的测试用例:');
      report.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.testCase.id}: ${r.testCase.title}`);
          if (r.error) {
            console.log(`    错误: ${r.error}`);
          }
        });
      console.log('');
    }
  }
}

