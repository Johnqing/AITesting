<template>
  <div class="reports-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>测试报告</span>
          <el-button type="primary" @click="loadReports" :loading="loading">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>

      <el-table :data="reports" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="报告ID" width="200" />
        <el-table-column prop="filename" label="文件名" />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="修改时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.modifiedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="大小" width="100">
          <template #default="{ row }">
            {{ formatSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="viewDetailedReport(row.id)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 详细报告对话框 -->
      <el-dialog 
        v-model="detailedReportVisible" 
        :title="`详细测试报告 - ${currentReportId}`" 
        width="95%"
        :close-on-click-modal="false"
      >
        <div v-if="reportData" class="detailed-report">
          <!-- 测试概览 -->
          <el-card class="report-section">
            <template #header>
              <h3>测试概览</h3>
            </template>
            <div class="overview-stats">
              <el-row :gutter="20">
                <el-col :span="6">
                  <div class="stat-card">
                    <div class="stat-value">{{ reportData.total }}</div>
                    <div class="stat-label">总测试用例</div>
                  </div>
                </el-col>
                <el-col :span="6">
                  <div class="stat-card success">
                    <div class="stat-value">{{ reportData.passed }}</div>
                    <div class="stat-label">通过</div>
                  </div>
                </el-col>
                <el-col :span="6">
                  <div class="stat-card danger">
                    <div class="stat-value">{{ reportData.failed }}</div>
                    <div class="stat-label">失败</div>
                  </div>
                </el-col>
                <el-col :span="6">
                  <div class="stat-card">
                    <div class="stat-value">{{ ((reportData.passed / reportData.total) * 100).toFixed(2) }}%</div>
                    <div class="stat-label">通过率</div>
                  </div>
                </el-col>
              </el-row>
              <el-row :gutter="20" style="margin-top: 20px;">
                <el-col :span="12">
                  <div class="info-item">
                    <strong>执行时间:</strong> {{ reportData.startTime }} - {{ reportData.endTime }}
                  </div>
                </el-col>
                <el-col :span="12">
                  <div class="info-item">
                    <strong>总耗时:</strong> {{ (reportData.duration / 1000).toFixed(2) }} 秒
                  </div>
                </el-col>
              </el-row>
            </div>
          </el-card>

          <!-- 详细统计 -->
          <el-card class="report-section" v-if="reportData.summary">
            <template #header>
              <h3>详细统计</h3>
            </template>
            <el-row :gutter="20">
              <el-col :span="12">
                <h4>操作统计</h4>
                <ul class="stat-list">
                  <li>总操作数: <strong>{{ reportData.summary.totalActions }}</strong> 个</li>
                  <li>操作通过: <strong class="success-text">{{ reportData.summary.passedActions }}</strong> 个</li>
                  <li>操作失败: <strong class="danger-text">{{ reportData.summary.failedActions }}</strong> 个</li>
                  <li>操作通过率: <strong>{{ reportData.summary.totalActions > 0 ? ((reportData.summary.passedActions / reportData.summary.totalActions) * 100).toFixed(2) : 0 }}%</strong></li>
                </ul>
              </el-col>
              <el-col :span="12">
                <h4>预期结果统计</h4>
                <ul class="stat-list">
                  <li>预期结果总数: <strong>{{ reportData.summary.totalExpectedResults }}</strong> 个</li>
                  <li>预期结果匹配: <strong class="success-text">{{ reportData.summary.matchedExpectedResults }}</strong> 个</li>
                  <li>预期结果未匹配: <strong class="danger-text">{{ reportData.summary.unmatchedExpectedResults }}</strong> 个</li>
                  <li>预期结果匹配率: <strong>{{ reportData.summary.totalExpectedResults > 0 ? ((reportData.summary.matchedExpectedResults / reportData.summary.totalExpectedResults) * 100).toFixed(2) : 0 }}%</strong></li>
                </ul>
              </el-col>
            </el-row>
          </el-card>

          <!-- 操作类型分布 -->
          <el-card class="report-section" v-if="actionTypeStats.length > 0">
            <template #header>
              <h3>操作类型分布</h3>
            </template>
            <el-table :data="actionTypeStats" border>
              <el-table-column prop="type" label="操作类型" width="150" />
              <el-table-column prop="count" label="总数" width="100" />
              <el-table-column prop="passed" label="通过" width="100">
                <template #default="{ row }">
                  <span class="success-text">{{ row.passed }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="failed" label="失败" width="100">
                <template #default="{ row }">
                  <span class="danger-text">{{ row.failed }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="passRate" label="通过率" width="120">
                <template #default="{ row }">
                  {{ row.passRate }}%
                </template>
              </el-table-column>
              <el-table-column prop="avgDuration" label="平均耗时(ms)" width="150" />
            </el-table>
          </el-card>

          <!-- 操作耗时统计 -->
          <el-card class="report-section" v-if="durationStats">
            <template #header>
              <h3>操作耗时统计</h3>
            </template>
            <el-row :gutter="20">
              <el-col :span="6">
                <div class="stat-item">
                  <div class="stat-label">最快操作</div>
                  <div class="stat-value">{{ durationStats.min }} ms</div>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="stat-item">
                  <div class="stat-label">最慢操作</div>
                  <div class="stat-value">{{ durationStats.max }} ms</div>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="stat-item">
                  <div class="stat-label">平均耗时</div>
                  <div class="stat-value">{{ durationStats.avg }} ms</div>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="stat-item">
                  <div class="stat-label">总耗时</div>
                  <div class="stat-value">{{ durationStats.total }} 秒</div>
                </div>
              </el-col>
            </el-row>
          </el-card>

          <!-- 测试用例详情 -->
          <el-card class="report-section" v-for="(result, index) in reportData.results" :key="index">
            <template #header>
              <div class="test-case-header">
                <h3>{{ index + 1 }}. {{ result.testCase.id }} - {{ result.testCase.title }}</h3>
                <el-tag :type="result.success ? 'success' : 'danger'" size="large">
                  {{ result.success ? '✅ 通过' : '❌ 失败' }}
                </el-tag>
              </div>
            </template>

            <div class="test-case-info">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="功能模块">{{ result.testCase.module }}</el-descriptions-item>
                <el-descriptions-item label="优先级">{{ result.testCase.priority }}</el-descriptions-item>
                <el-descriptions-item label="测试类型">{{ result.testCase.testType }}</el-descriptions-item>
                <el-descriptions-item label="执行时间">{{ (result.duration / 1000).toFixed(2) }} 秒</el-descriptions-item>
                <el-descriptions-item label="开始时间" :span="2">{{ result.startTime }}</el-descriptions-item>
                <el-descriptions-item label="结束时间" :span="2">{{ result.endTime }}</el-descriptions-item>
              </el-descriptions>

              <div v-if="result.summary" class="test-summary">
                <el-tag>操作统计: 总计 {{ result.summary.totalActions }} 个，通过 {{ result.summary.passedActions }} 个，失败 {{ result.summary.failedActions }} 个</el-tag>
                <el-tag style="margin-left: 10px;">预期结果匹配: {{ result.summary.matchedExpectedResults }}/{{ result.summary.totalExpectedResults }} 个匹配</el-tag>
              </div>

              <div v-if="result.error" class="error-message">
                <el-alert type="error" :title="result.error" :closable="false" />
              </div>

              <!-- 前置条件 -->
              <div v-if="result.testCase.preconditions && result.testCase.preconditions.length > 0" class="section">
                <h4>前置条件</h4>
                <ul>
                  <li v-for="(precondition, idx) in result.testCase.preconditions" :key="idx">{{ precondition }}</li>
                </ul>
              </div>

              <!-- 测试步骤 -->
              <div v-if="result.testCase.steps && result.testCase.steps.length > 0" class="section">
                <h4>测试步骤</h4>
                <ol>
                  <li v-for="(step, idx) in result.testCase.steps" :key="idx">{{ step }}</li>
                </ol>
              </div>

              <!-- 操作执行详情 -->
              <div class="section">
                <h4>操作执行详情</h4>
                <el-table :data="result.actionResults" border>
                  <el-table-column type="index" label="#" width="60" />
                  <el-table-column prop="action.type" label="操作类型" width="120" />
                  <el-table-column prop="action.description" label="描述" min-width="200" />
                  <el-table-column label="状态" width="80">
                    <template #default="{ row }">
                      <el-tag :type="row.result.success ? 'success' : 'danger'" size="small">
                        {{ row.result.success ? '✅' : '❌' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="duration" label="耗时(ms)" width="100">
                    <template #default="{ row }">
                      {{ row.duration ? row.duration.toFixed(0) : '-' }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="timestamp" label="执行时间" width="180" />
                  <el-table-column prop="result.message" label="执行结果" min-width="200" />
                  <el-table-column label="操作" width="120">
                    <template #default="{ row }">
                      <el-button size="small" @click="showActionDetail(row)">详情</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </div>

              <!-- 预期结果检查 -->
              <div v-if="result.expectedResultsCheck && result.expectedResultsCheck.length > 0" class="section">
                <h4>预期结果检查</h4>
                <div class="match-stats">
                  <el-tag type="info">
                    匹配统计: {{ result.expectedResultsCheck.filter(c => c.matched).length }}/{{ result.expectedResultsCheck.length }} 个预期结果匹配
                    ({{ result.expectedResultsCheck.length > 0 ? ((result.expectedResultsCheck.filter(c => c.matched).length / result.expectedResultsCheck.length) * 100).toFixed(2) : 0 }}%)
                  </el-tag>
                </div>
                <el-table :data="result.expectedResultsCheck" border>
                  <el-table-column type="index" label="#" width="60" />
                  <el-table-column label="匹配状态" width="100">
                    <template #default="{ row }">
                      <el-tag :type="row.matched ? 'success' : 'danger'" size="small">
                        {{ row.matched ? '✅' : '❌' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="expected" label="预期结果" min-width="250" />
                  <el-table-column prop="actual" label="实际结果" min-width="300" />
                  <el-table-column prop="matchType" label="匹配类型" width="120">
                    <template #default="{ row }">
                      <el-tag :type="getMatchTypeTagType(row.matchType)" size="small">
                        {{ getMatchTypeLabel(row.matchType) }}
                      </el-tag>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </el-card>
        </div>
      </el-dialog>

      <!-- 操作详情对话框 -->
      <el-dialog v-model="actionDetailVisible" title="操作执行详情" width="85%" :close-on-click-modal="false">
        <div v-if="currentAction">
          <el-tabs v-model="actionDetailTab">
            <!-- 基本信息 -->
            <el-tab-pane label="基本信息" name="basic">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="操作类型">
                  <el-tag>{{ currentAction.action.type }}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="状态">
                  <el-tag :type="currentAction.result.success ? 'success' : 'danger'">
                    {{ currentAction.result.success ? '✅ 成功' : '❌ 失败' }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="描述" :span="2">{{ currentAction.action.description }}</el-descriptions-item>
                <el-descriptions-item label="执行时间">{{ currentAction.timestamp }}</el-descriptions-item>
                <el-descriptions-item label="耗时">
                  {{ currentAction.duration ? currentAction.duration.toFixed(0) + ' ms' : '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="执行结果" :span="2">
                  <div class="result-message">{{ currentAction.result.message }}</div>
                </el-descriptions-item>
                <el-descriptions-item label="选择器" v-if="currentAction.action.selector" :span="2">
                  <code class="code-block">{{ currentAction.action.selector }}</code>
                </el-descriptions-item>
                <el-descriptions-item label="URL" v-if="currentAction.action.url" :span="2">
                  <a :href="currentAction.action.url" target="_blank">{{ currentAction.action.url }}</a>
                </el-descriptions-item>
                <el-descriptions-item label="输入文本" v-if="currentAction.action.text" :span="2">
                  <code class="code-block">{{ currentAction.action.text }}</code>
                </el-descriptions-item>
                <el-descriptions-item label="预期值" v-if="currentAction.action.expected" :span="2">
                  <code class="code-block">{{ currentAction.action.expected }}</code>
                </el-descriptions-item>
                <el-descriptions-item label="超时设置" v-if="currentAction.action.timeout" :span="2">
                  {{ currentAction.action.timeout }}ms
                </el-descriptions-item>
                <el-descriptions-item label="错误信息" v-if="currentAction.result.error" :span="2">
                  <el-alert type="error" :title="currentAction.result.error" :closable="false" show-icon />
                </el-descriptions-item>
              </el-descriptions>
            </el-tab-pane>

            <!-- 执行详情 -->
            <el-tab-pane label="执行详情" name="details" v-if="currentAction.result.screenshot">
              <div class="execution-details">
                <div v-if="parsedScreenshot">
                  <!-- Playwright 代码 -->
                  <div v-if="parsedScreenshot.playwrightCode" class="detail-section">
                    <h4>执行的 Playwright 代码</h4>
                    <pre class="code-block"><code>{{ parsedScreenshot.playwrightCode }}</code></pre>
                  </div>

                  <!-- 执行结果 -->
                  <div v-if="parsedScreenshot.result" class="detail-section">
                    <h4>执行结果</h4>
                    <div class="result-content">
                      <pre class="code-block" v-if="typeof parsedScreenshot.result === 'string'">{{ parsedScreenshot.result }}</pre>
                      <el-alert v-else-if="parsedScreenshot.result === false" type="warning" title="验证失败" :closable="false" />
                      <pre v-else class="code-block">{{ JSON.stringify(parsedScreenshot.result, null, 2) }}</pre>
                    </div>
                  </div>

                  <!-- 控制台消息 -->
                  <div v-if="parsedScreenshot.consoleMessages && parsedScreenshot.consoleMessages.length > 0" class="detail-section">
                    <h4>控制台消息</h4>
                    <el-scrollbar height="200px">
                      <ul class="console-messages">
                        <li v-for="(msg, idx) in parsedScreenshot.consoleMessages" :key="idx" 
                            :class="getConsoleMessageType(msg)">
                          <pre>{{ msg }}</pre>
                        </li>
                      </ul>
                    </el-scrollbar>
                  </div>

                  <!-- 页面状态 -->
                  <div v-if="parsedScreenshot.pageState" class="detail-section">
                    <h4>页面状态</h4>
                    <el-descriptions :column="1" border>
                      <el-descriptions-item label="页面URL" v-if="parsedScreenshot.pageState.url">
                        <a :href="parsedScreenshot.pageState.url" target="_blank">{{ parsedScreenshot.pageState.url }}</a>
                      </el-descriptions-item>
                      <el-descriptions-item label="页面标题" v-if="parsedScreenshot.pageState.title">
                        {{ parsedScreenshot.pageState.title }}
                      </el-descriptions-item>
                      <el-descriptions-item label="页面快照" v-if="parsedScreenshot.pageState.snapshot">
                        <el-scrollbar height="300px">
                          <pre class="code-block yaml-block">{{ parsedScreenshot.pageState.snapshot }}</pre>
                        </el-scrollbar>
                      </el-descriptions-item>
                    </el-descriptions>
                  </div>

                  <!-- 原始数据 -->
                  <div class="detail-section">
                    <h4>原始执行数据</h4>
                    <el-collapse>
                      <el-collapse-item title="查看原始数据" name="raw">
                        <el-scrollbar height="400px">
                          <pre class="code-block">{{ currentAction.result.screenshot }}</pre>
                        </el-scrollbar>
                      </el-collapse-item>
                    </el-collapse>
                  </div>
                </div>
                <div v-else>
                  <el-scrollbar height="500px">
                    <pre class="code-block">{{ currentAction.result.screenshot }}</pre>
                  </el-scrollbar>
                </div>
              </div>
            </el-tab-pane>

          </el-tabs>
        </div>
      </el-dialog>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { listReports, getReport } from '@/api'

const loading = ref(false)
const reports = ref<any[]>([])
const detailedReportVisible = ref(false)
const currentReportId = ref('')
const reportData = ref<any>(null)
const actionDetailVisible = ref(false)
const currentAction = ref<any>(null)
const actionDetailTab = ref('basic')
const parsedScreenshot = ref<any>(null)

const loadReports = async () => {
  loading.value = true
  try {
    const data = await listReports()
    if (data.success) {
      reports.value = data.data
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const viewDetailedReport = async (reportId: string) => {
  currentReportId.value = reportId
  detailedReportVisible.value = true

  try {
    const response = await getReport(reportId, 'json')
    const data = typeof response === 'string' ? JSON.parse(response) : response
    reportData.value = data.data || data

    // 计算操作类型统计
    calculateActionTypeStats()
    calculateDurationStats()
  } catch (error: any) {
    ElMessage.error(error.message || '加载报告失败')
  }
}

const actionTypeStats = ref<any[]>([])

const calculateActionTypeStats = () => {
  if (!reportData.value) return

  const statsMap = new Map<string, { count: number; passed: number; failed: number; totalDuration: number }>()

  reportData.value.results.forEach((result: any) => {
    result.actionResults.forEach((ar: any) => {
      const type = ar.action.type
      if (!statsMap.has(type)) {
        statsMap.set(type, { count: 0, passed: 0, failed: 0, totalDuration: 0 })
      }
      const stats = statsMap.get(type)!
      stats.count++
      if (ar.result.success) {
        stats.passed++
      } else {
        stats.failed++
      }
      if (ar.duration) {
        stats.totalDuration += ar.duration
      }
    })
  })

  actionTypeStats.value = Array.from(statsMap.entries()).map(([type, stats]) => ({
    type,
    count: stats.count,
    passed: stats.passed,
    failed: stats.failed,
    passRate: stats.count > 0 ? ((stats.passed / stats.count) * 100).toFixed(2) : '0.00',
    avgDuration: stats.count > 0 ? (stats.totalDuration / stats.count).toFixed(0) : '0'
  }))
}

const durationStats = ref<any>(null)

const calculateDurationStats = () => {
  if (!reportData.value) return

  const allDurations = reportData.value.results
    .flatMap((r: any) => r.actionResults.map((ar: any) => ar.duration || 0))
    .filter((d: number) => d > 0)

  if (allDurations.length > 0) {
    durationStats.value = {
      min: Math.min(...allDurations).toFixed(0),
      max: Math.max(...allDurations).toFixed(0),
      avg: (allDurations.reduce((sum: number, d: number) => sum + d, 0) / allDurations.length).toFixed(0),
      total: (allDurations.reduce((sum: number, d: number) => sum + d, 0) / 1000).toFixed(2)
    }
  }
}

const showActionDetail = (action: any) => {
  currentAction.value = action
  actionDetailTab.value = 'basic'
  parsedScreenshot.value = null
  if (action.result.screenshot) {
    parsedScreenshot.value = parseScreenshot(action.result.screenshot)
  }
  actionDetailVisible.value = true
}

const parseScreenshot = (screenshot: string): any | null => {
  if (!screenshot) return null

  const result: any = {
    playwrightCode: null,
    result: null,
    consoleMessages: [],
    pageState: null
  }

  try {
    // 解析 Playwright 代码
    const playwrightMatch = screenshot.match(/### Ran Playwright code\n([\s\S]*?)(?=\n###|$)/)
    if (playwrightMatch) {
      result.playwrightCode = playwrightMatch[1].trim()
    }

    // 解析执行结果
    const resultMatch = screenshot.match(/### Result\n([\s\S]*?)(?=\n###|$)/)
    if (resultMatch) {
      const resultText = resultMatch[1].trim()
      // 尝试解析为 JSON
      try {
        result.result = JSON.parse(resultText)
      } catch {
        // 如果不是 JSON，检查是否是布尔值或错误信息
        if (resultText === 'false') {
          result.result = false
        } else if (resultText === 'true') {
          result.result = true
        } else if (resultText.startsWith('Error:')) {
          result.result = resultText
        } else {
          result.result = resultText
        }
      }
    }

    // 解析控制台消息
    const consoleMatch = screenshot.match(/### New console messages\n([\s\S]*?)(?=\n###|$)/)
    if (consoleMatch) {
      const consoleText = consoleMatch[1].trim()
      result.consoleMessages = consoleText
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
    }

    // 解析页面状态
    const pageStateMatch = screenshot.match(/### Page state\n([\s\S]*?)(?=\n###|$)/)
    if (pageStateMatch) {
      const pageStateText = pageStateMatch[1].trim()
      result.pageState = {
        url: null,
        title: null,
        snapshot: null
      }

      // 提取 URL
      const urlMatch = pageStateText.match(/- Page URL: (.+)/)
      if (urlMatch) {
        result.pageState.url = urlMatch[1].trim()
      }

      // 提取标题
      const titleMatch = pageStateText.match(/- Page Title: (.+)/)
      if (titleMatch) {
        result.pageState.title = titleMatch[1].trim()
      }

      // 提取快照
      const snapshotMatch = pageStateText.match(/```yaml\n([\s\S]*?)```/)
      if (snapshotMatch) {
        result.pageState.snapshot = snapshotMatch[1].trim()
      } else {
        // 如果没有 yaml 格式，尝试提取其他格式
        const snapshotMatch2 = pageStateText.match(/```[\s\S]*?\n([\s\S]*?)```/)
        if (snapshotMatch2) {
          result.pageState.snapshot = snapshotMatch2[1].trim()
        }
      }
    }

    return result
  } catch (error) {
    console.error('Failed to parse screenshot:', error)
    return null
  }
}

const getConsoleMessageType = (message: string): string => {
  if (message.includes('Error') || message.includes('error')) return 'error'
  if (message.includes('Warning') || message.includes('warning')) return 'warning'
  if (message.includes('LOG')) return 'log'
  return 'info'
}

const getMatchTypeLabel = (matchType: string) => {
  const labels: Record<string, string> = {
    'exact': '完全匹配',
    'partial': '部分匹配',
    'contains': '包含匹配',
    'not_matched': '未匹配'
  }
  return labels[matchType] || matchType
}

const getMatchTypeTagType = (matchType: string) => {
  const types: Record<string, string> = {
    'exact': 'success',
    'partial': 'warning',
    'contains': 'warning',
    'not_matched': 'danger'
  }
  return types[matchType] || 'info'
}

const formatTime = (time: string) => {
  return new Date(time).toLocaleString('zh-CN')
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

onMounted(() => {
  loadReports()
})
</script>

<style scoped>
.reports-page {
  max-width: 1400px;
  margin: 0 auto;
}

.card-header {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detailed-report {
  max-height: 80vh;
  overflow-y: auto;
}

.report-section {
  margin-bottom: 20px;
}

.overview-stats {
  padding: 10px 0;
}

.stat-card {
  text-align: center;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
  border: 2px solid #e4e7ed;
}

.stat-card.success {
  background: #f0f9ff;
  border-color: #67c23a;
}

.stat-card.danger {
  background: #fef0f0;
  border-color: #f56c6c;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 8px;
}

.stat-card.success .stat-value {
  color: #67c23a;
}

.stat-card.danger .stat-value {
  color: #f56c6c;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}

.info-item {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.stat-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.stat-list li {
  padding: 8px 0;
  border-bottom: 1px solid #ebeef5;
}

.stat-list li:last-child {
  border-bottom: none;
}

.success-text {
  color: #67c23a;
}

.danger-text {
  color: #f56c6c;
}

.test-case-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.test-case-info {
  margin-top: 20px;
}

.test-summary {
  margin: 20px 0;
}

.error-message {
  margin: 20px 0;
}

.section {
  margin: 20px 0;
}

.section h4 {
  margin-bottom: 10px;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.section ul,
.section ol {
  margin-left: 20px;
  line-height: 1.8;
}

.match-stats {
  margin-bottom: 15px;
}

.stat-item {
  text-align: center;
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.stat-item .stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-item .stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}

.markdown-content {
  padding: 20px;
  background: #f5f7fa;
  border-radius: 4px;
  max-height: 600px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-family: 'Courier New', monospace;
}

code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.code-block {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
  font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.yaml-block {
  background: #282c34;
  color: #abb2bf;
  padding: 15px;
  border-radius: 4px;
}

.result-message {
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 14px;
}

.execution-details {
  padding: 10px 0;
}

.detail-section {
  margin-bottom: 25px;
}

.detail-section h4 {
  margin-bottom: 12px;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
  padding-bottom: 8px;
  border-bottom: 2px solid #e4e7ed;
}

.result-content {
  margin-top: 10px;
}

.console-messages {
  list-style: none;
  padding: 0;
  margin: 0;
}

.console-messages li {
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 4px;
  border-left: 3px solid #e4e7ed;
}

.console-messages li.error {
  background: #fef0f0;
  border-left-color: #f56c6c;
  color: #f56c6c;
}

.console-messages li.warning {
  background: #fdf6ec;
  border-left-color: #e6a23c;
  color: #e6a23c;
}

.console-messages li.log {
  background: #f0f9ff;
  border-left-color: #409eff;
  color: #409eff;
}

.console-messages li.info {
  background: #f5f7fa;
  border-left-color: #909399;
  color: #909399;
}

.console-messages li pre {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
