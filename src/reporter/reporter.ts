import { TestReport, TestResult, ExpectedResultCheck } from '../types/result.js';
import { formatDateTime } from '../utils/date.js';
import { testReportService } from '../db/index.js';

export class Reporter {
  constructor() {
    // 不再需要输出目录，所有报告都保存到数据库
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

    // 计算总体统计
    const totalActions = results.reduce((sum, r) => sum + (r.summary?.totalActions || 0), 0);
    const passedActions = results.reduce((sum, r) => sum + (r.summary?.passedActions || 0), 0);
    const failedActions = results.reduce((sum, r) => sum + (r.summary?.failedActions || 0), 0);
    const totalExpectedResults = results.reduce((sum, r) => sum + (r.summary?.totalExpectedResults || 0), 0);
    const matchedExpectedResults = results.reduce((sum, r) => sum + (r.summary?.matchedExpectedResults || 0), 0);

    return {
      total: results.length,
      passed,
      failed,
      duration: totalDuration,
      startTime,
      endTime,
      results,
      summary: {
        totalActions,
        passedActions,
        failedActions,
        totalExpectedResults,
        matchedExpectedResults,
        unmatchedExpectedResults: totalExpectedResults - matchedExpectedResults
      }
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

    // 添加详细统计
    if (report.summary) {
      lines.push('### 详细统计\n');
      lines.push(`- **总操作数**: ${report.summary.totalActions} 个`);
      lines.push(`- **操作通过**: ${report.summary.passedActions} 个`);
      lines.push(`- **操作失败**: ${report.summary.failedActions} 个`);
      lines.push(`- **操作通过率**: ${report.summary.totalActions > 0 ? ((report.summary.passedActions / report.summary.totalActions) * 100).toFixed(2) : 0}%`);
      lines.push(`- **预期结果总数**: ${report.summary.totalExpectedResults} 个`);
      lines.push(`- **预期结果匹配**: ${report.summary.matchedExpectedResults} 个`);
      lines.push(`- **预期结果未匹配**: ${report.summary.unmatchedExpectedResults} 个`);
      lines.push(`- **预期结果匹配率**: ${report.summary.totalExpectedResults > 0 ? ((report.summary.matchedExpectedResults / report.summary.totalExpectedResults) * 100).toFixed(2) : 0}%\n`);
    }

    // 添加操作类型分布统计
    const actionTypeStats = new Map<string, { count: number; passed: number; failed: number; totalDuration: number }>();
    report.results.forEach(result => {
      result.actionResults.forEach(ar => {
        const type = ar.action.type;
        if (!actionTypeStats.has(type)) {
          actionTypeStats.set(type, { count: 0, passed: 0, failed: 0, totalDuration: 0 });
        }
        const stats = actionTypeStats.get(type)!;
        stats.count++;
        if (ar.result.success) {
          stats.passed++;
        } else {
          stats.failed++;
        }
        if (ar.duration) {
          stats.totalDuration += ar.duration;
        }
      });
    });

    if (actionTypeStats.size > 0) {
      lines.push('### 操作类型分布\n');
      lines.push('| 操作类型 | 总数 | 通过 | 失败 | 通过率 | 平均耗时(ms) |');
      lines.push('|---------|------|------|------|--------|-------------|');
      Array.from(actionTypeStats.entries()).forEach(([type, stats]) => {
        const passRate = stats.count > 0 ? ((stats.passed / stats.count) * 100).toFixed(2) : '0.00';
        const avgDuration = stats.count > 0 ? (stats.totalDuration / stats.count).toFixed(0) : '0';
        lines.push(`| ${type} | ${stats.count} | ${stats.passed} | ${stats.failed} | ${passRate}% | ${avgDuration} |`);
      });
      lines.push('');
    }

    // 添加操作耗时统计
    const allDurations = report.results
      .flatMap(r => r.actionResults.map(ar => ar.duration || 0))
      .filter(d => d > 0);
    
    if (allDurations.length > 0) {
      const minDuration = Math.min(...allDurations);
      const maxDuration = Math.max(...allDurations);
      const avgDuration = allDurations.reduce((sum, d) => sum + d, 0) / allDurations.length;
      lines.push('### 操作耗时统计\n');
      lines.push(`- **最快操作**: ${minDuration.toFixed(0)} ms`);
      lines.push(`- **最慢操作**: ${maxDuration.toFixed(0)} ms`);
      lines.push(`- **平均耗时**: ${avgDuration.toFixed(0)} ms`);
      lines.push(`- **总耗时**: ${(allDurations.reduce((sum, d) => sum + d, 0) / 1000).toFixed(2)} 秒\n`);
    }

    lines.push('## 详细结果\n');

    report.results.forEach((result, index) => {
      const status = result.success ? '✅ 通过' : '❌ 失败';
      lines.push(`### ${index + 1}. ${result.testCase.id} - ${result.testCase.title}`);
      lines.push(`**状态**: ${status}`);
      lines.push(`**功能模块**: ${result.testCase.module}`);
      lines.push(`**优先级**: ${result.testCase.priority}`);
      lines.push(`**测试类型**: ${result.testCase.testType}`);
      lines.push(`**执行时间**: ${(result.duration / 1000).toFixed(2)} 秒`);
      
      // 添加统计信息
      if (result.summary) {
        lines.push(`**操作统计**: 总计 ${result.summary.totalActions} 个，通过 ${result.summary.passedActions} 个，失败 ${result.summary.failedActions} 个`);
        lines.push(`**预期结果匹配**: ${result.summary.matchedExpectedResults}/${result.summary.totalExpectedResults} 个匹配\n`);
      } else {
        lines.push('');
      }

      if (result.error) {
        lines.push(`**错误信息**: ${result.error}\n`);
      }

      // 前置条件
      if (result.testCase.preconditions && result.testCase.preconditions.length > 0) {
        lines.push('#### 前置条件\n');
        result.testCase.preconditions.forEach((precondition, idx) => {
          lines.push(`${idx + 1}. ${precondition}`);
        });
        lines.push('');
      }

      // 测试步骤
      if (result.testCase.steps && result.testCase.steps.length > 0) {
        lines.push('#### 测试步骤\n');
        result.testCase.steps.forEach((step, idx) => {
          lines.push(`${idx + 1}. ${step}`);
        });
        lines.push('');
        
        // 添加步骤与操作的对应关系
        if (result.actionResults.length > 0) {
          lines.push('#### 步骤与操作对应关系\n');
          result.testCase.steps.forEach((step, stepIdx) => {
            lines.push(`**步骤 ${stepIdx + 1}**: ${step}`);
            // 尝试匹配相关的操作（简单的关键词匹配）
            const stepKeywords = step.toLowerCase()
              .replace(/[，。、；：！？""''（）()【】\[\]]/g, ' ')
              .split(/\s+/)
              .filter(k => k.length > 1);
            
            const relatedActions = result.actionResults.filter((ar, arIdx) => {
              const actionText = (ar.action.description + ' ' + (ar.action.text || '') + ' ' + (ar.action.selector || '')).toLowerCase();
              return stepKeywords.some(k => actionText.includes(k));
            });
            
            if (relatedActions.length > 0) {
              relatedActions.forEach((ar, arIdx) => {
                const arStatus = ar.result.success ? '✅' : '❌';
                const actionNum = result.actionResults.indexOf(ar) + 1;
                lines.push(`  - ${arStatus} [操作 ${actionNum}] ${ar.action.type}: ${ar.action.description}`);
              });
            } else {
              lines.push(`  - 未找到明确对应的操作`);
            }
            lines.push('');
          });
        }
      }

      // 操作执行详情
      lines.push('#### 操作执行详情\n');
      
      // 计算操作耗时统计
      const actionDurations = result.actionResults
        .map(ar => ar.duration || 0)
        .filter(d => d > 0);
      const avgActionDuration = actionDurations.length > 0
        ? actionDurations.reduce((sum, d) => sum + d, 0) / actionDurations.length
        : 0;
      
      if (actionDurations.length > 0) {
        lines.push(`**操作耗时统计**: 最快 ${Math.min(...actionDurations).toFixed(0)}ms, 最慢 ${Math.max(...actionDurations).toFixed(0)}ms, 平均 ${avgActionDuration.toFixed(0)}ms\n`);
      }

      result.actionResults.forEach((ar, arIndex) => {
        const arStatus = ar.result.success ? '✅' : '❌';
        lines.push(`${arIndex + 1}. ${arStatus} **${ar.action.type}**: ${ar.action.description}`);
        lines.push(`   - **执行时间**: ${formatDateTime(ar.timestamp)}`);
        if (ar.duration !== undefined) {
          lines.push(`   - **耗时**: ${ar.duration.toFixed(0)} ms`);
        }
        if (ar.result.message) {
          lines.push(`   - **执行结果**: ${ar.result.message}`);
        }
        if (ar.action.selector) {
          lines.push(`   - **选择器**: \`${ar.action.selector}\``);
        }
        if (ar.action.url) {
          lines.push(`   - **URL**: ${ar.action.url}`);
        }
        if (ar.action.text) {
          lines.push(`   - **输入文本**: "${ar.action.text}"`);
        }
        if (ar.action.expected) {
          lines.push(`   - **预期值**: ${ar.action.expected}`);
        }
        if (ar.action.timeout) {
          lines.push(`   - **超时设置**: ${ar.action.timeout}ms`);
        }
        if (ar.result.screenshot) {
          lines.push(`   - **截图**: 已保存`);
        }
        if (ar.result.error) {
          lines.push(`   - **❌ 错误**: ${ar.result.error}`);
        }
        // 显示操作状态详情
        if (!ar.result.success && !ar.result.error) {
          lines.push(`   - **⚠️ 警告**: 操作未成功完成`);
        }
        lines.push('');
      });

      // 预期结果检查
      if (result.expectedResultsCheck && result.expectedResultsCheck.length > 0) {
        lines.push('#### 预期结果检查\n');
        
        // 统计匹配情况
        const matchedCount = result.expectedResultsCheck.filter(c => c.matched).length;
        const totalCount = result.expectedResultsCheck.length;
        const matchRate = totalCount > 0 ? ((matchedCount / totalCount) * 100).toFixed(2) : '0.00';
        lines.push(`**匹配统计**: ${matchedCount}/${totalCount} 个预期结果匹配 (${matchRate}%)\n`);

        result.expectedResultsCheck.forEach((check, idx) => {
          const checkStatus = check.matched ? '✅' : '❌';
          const matchTypeLabel = {
            'exact': '✅ 完全匹配',
            'partial': '⚠️ 部分匹配',
            'contains': '⚠️ 包含匹配',
            'not_matched': '❌ 未匹配'
          }[check.matchType];
          
          lines.push(`${idx + 1}. ${checkStatus} **预期结果**: ${check.expected}`);
          lines.push(`   - **实际结果**: ${check.actual}`);
          lines.push(`   - **匹配状态**: ${matchTypeLabel}`);
          
          // 如果不匹配，提供更详细的信息
          if (!check.matched) {
            // 尝试找出相关的操作
            const relatedActions = result.actionResults.filter(ar => {
              const desc = ar.action.description.toLowerCase();
              const expectedLower = check.expected.toLowerCase();
              return desc.includes(expectedLower) || expectedLower.includes(desc);
            });
            
            if (relatedActions.length > 0) {
              lines.push(`   - **相关操作**:`);
              relatedActions.forEach(ar => {
                const arStatus = ar.result.success ? '✅' : '❌';
                lines.push(`     - ${arStatus} ${ar.action.type}: ${ar.action.description}`);
                if (ar.result.message) {
                  lines.push(`       结果: ${ar.result.message}`);
                }
              });
            }
          }
          lines.push('');
        });
      } else if (result.testCase.expectedResults && result.testCase.expectedResults.length > 0) {
        lines.push('#### 预期结果（未检查）\n');
        lines.push('> ⚠️ 注意：此测试用例的预期结果未进行自动检查验证。\n');
        result.testCase.expectedResults.forEach((expected, idx) => {
          lines.push(`${idx + 1}. ${expected}`);
        });
        lines.push('');
      }

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
   * 保存报告到数据库
   */
  async saveReport(report: TestReport): Promise<string> {
    try {
      const reportId = await testReportService.createTestReport(report);
      console.log(`Report saved to database: ${reportId}`);
      return reportId;
    } catch (error) {
      console.error('Failed to save report to database:', error);
      throw error;
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
    
    if (report.summary) {
      console.log('\n详细统计:');
      console.log(`  总操作数: ${report.summary.totalActions} 个`);
      console.log(`  操作通过: ${report.summary.passedActions} 个`);
      console.log(`  操作失败: ${report.summary.failedActions} 个`);
      console.log(`  操作通过率: ${report.summary.totalActions > 0 ? ((report.summary.passedActions / report.summary.totalActions) * 100).toFixed(2) : 0}%`);
      console.log(`  预期结果总数: ${report.summary.totalExpectedResults} 个`);
      console.log(`  预期结果匹配: ${report.summary.matchedExpectedResults} 个`);
      console.log(`  预期结果未匹配: ${report.summary.unmatchedExpectedResults} 个`);
      console.log(`  预期结果匹配率: ${report.summary.totalExpectedResults > 0 ? ((report.summary.matchedExpectedResults / report.summary.totalExpectedResults) * 100).toFixed(2) : 0}%`);
    }
    
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
          if (r.summary) {
            console.log(`    操作失败: ${r.summary.failedActions}/${r.summary.totalActions}`);
            console.log(`    预期结果未匹配: ${r.summary.unmatchedExpectedResults}/${r.summary.totalExpectedResults}`);
          }
        });
      console.log('');
    }

    // 显示预期结果未匹配的用例
    const unmatchedCases = report.results.filter(r => 
      r.expectedResultsCheck && 
      r.expectedResultsCheck.some(check => !check.matched)
    );
    
    if (unmatchedCases.length > 0) {
      console.log('预期结果未完全匹配的测试用例:');
      unmatchedCases.forEach(r => {
        const unmatchedCount = r.expectedResultsCheck?.filter(c => !c.matched).length || 0;
        console.log(`  - ${r.testCase.id}: ${r.testCase.title} (${unmatchedCount} 个未匹配)`);
      });
      console.log('');
    }
  }
}

