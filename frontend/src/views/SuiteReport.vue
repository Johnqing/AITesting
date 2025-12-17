<template>
  <div class="suite-report-page">
    <el-card v-if="reportData">
      <template #header>
        <div class="card-header">
          <span>用例集测试报告 - {{ reportData.suite?.name }}</span>
          <div>
            <el-button @click="refreshReport" :loading="loading">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
            <el-button type="primary" @click="goBack">
              <el-icon><Back /></el-icon>
              返回
            </el-button>
          </div>
        </div>
      </template>

      <!-- 用例集基本信息 -->
      <el-card class="section-card" style="margin-bottom: 20px;">
        <template #header>
          <h3>用例集基本信息</h3>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="用例集ID">{{ reportData.suite?.suiteId }}</el-descriptions-item>
          <el-descriptions-item label="用例集名称">{{ reportData.suite?.name }}</el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ reportData.suite?.description || '-' }}</el-descriptions-item>
          <el-descriptions-item label="系统环境">{{ reportData.suite?.system || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ reportData.execution?.createdBy || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 执行概览 -->
      <el-card class="section-card" style="margin-bottom: 20px;">
        <template #header>
          <h3>执行概览</h3>
        </template>
        <el-row :gutter="20">
          <el-col :span="6">
            <div class="stat-card">
              <div class="stat-value">{{ reportData.report?.total || 0 }}</div>
              <div class="stat-label">总用例数</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card success">
              <div class="stat-value">{{ reportData.report?.passed || 0 }}</div>
              <div class="stat-label">通过</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card danger">
              <div class="stat-value">{{ reportData.report?.failed || 0 }}</div>
              <div class="stat-label">失败</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card">
              <div class="stat-value">{{ passRate.toFixed(2) }}%</div>
              <div class="stat-label">通过率</div>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" style="margin-top: 20px;">
          <el-col :span="8">
            <div class="info-item">
              <strong>执行ID:</strong> {{ reportData.execution?.executionId }}
            </div>
          </el-col>
          <el-col :span="8">
            <div class="info-item">
              <strong>开始时间:</strong> {{ formatTime(reportData.execution?.startTime) }}
            </div>
          </el-col>
          <el-col :span="8">
            <div class="info-item">
              <strong>结束时间:</strong> {{ formatTime(reportData.execution?.endTime) }}
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" style="margin-top: 10px;">
          <el-col :span="8">
            <div class="info-item">
              <strong>总耗时:</strong> {{ formatDuration(reportData.report?.duration) }}
            </div>
          </el-col>
          <el-col :span="8">
            <div class="info-item">
              <strong>执行状态:</strong>
              <el-tag :type="getStatusType(reportData.execution?.status)" style="margin-left: 8px;">
                {{ getStatusLabel(reportData.execution?.status) }}
              </el-tag>
            </div>
          </el-col>
        </el-row>
      </el-card>

      <!-- 综合评价 -->
      <el-card class="section-card" style="margin-bottom: 20px;">
        <template #header>
          <h3>综合评价</h3>
        </template>
        <div class="evaluation-section">
          <div class="evaluation-overall">
            <div class="overall-label">整体评价</div>
            <el-tag :type="getEvaluationType(reportData.evaluation?.overall)" size="large" class="overall-tag">
              {{ getEvaluationLabel(reportData.evaluation?.overall) }}
            </el-tag>
          </div>
          <el-row :gutter="20" style="margin-top: 20px;">
            <el-col :span="6">
              <div class="metric-item">
                <div class="metric-label">用例通过率</div>
                <div class="metric-value">{{ reportData.evaluation?.passRate.toFixed(2) }}%</div>
                <el-progress
                  :percentage="reportData.evaluation?.passRate || 0"
                  :color="getProgressColor(reportData.evaluation?.passRate || 0)"
                />
              </div>
            </el-col>
            <el-col :span="6">
              <div class="metric-item">
                <div class="metric-label">操作通过率</div>
                <div class="metric-value">{{ reportData.evaluation?.actionPassRate.toFixed(2) }}%</div>
                <el-progress
                  :percentage="reportData.evaluation?.actionPassRate || 0"
                  :color="getProgressColor(reportData.evaluation?.actionPassRate || 0)"
                />
              </div>
            </el-col>
            <el-col :span="6">
              <div class="metric-item">
                <div class="metric-label">预期结果匹配率</div>
                <div class="metric-value">{{ reportData.evaluation?.expectedResultMatchRate.toFixed(2) }}%</div>
                <el-progress
                  :percentage="reportData.evaluation?.expectedResultMatchRate || 0"
                  :color="getProgressColor(reportData.evaluation?.expectedResultMatchRate || 0)"
                />
              </div>
            </el-col>
            <el-col :span="6">
              <div class="metric-item">
                <div class="metric-label">平均执行时间</div>
                <div class="metric-value">{{ formatDuration(reportData.evaluation?.averageDuration) }}</div>
              </div>
            </el-col>
          </el-row>
          <div class="recommendations" style="margin-top: 20px;">
            <h4>改进建议</h4>
            <ul>
              <li v-for="(rec, index) in reportData.evaluation?.recommendations" :key="index">
                {{ rec }}
              </li>
            </ul>
          </div>
        </div>
      </el-card>

      <!-- 详细统计 -->
      <el-card class="section-card" style="margin-bottom: 20px;" v-if="reportData.report?.summary">
        <template #header>
          <h3>详细统计</h3>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="总操作数">{{ reportData.report.summary.totalActions }}</el-descriptions-item>
          <el-descriptions-item label="操作通过">{{ reportData.report.summary.passedActions }}</el-descriptions-item>
          <el-descriptions-item label="操作失败">{{ reportData.report.summary.failedActions }}</el-descriptions-item>
          <el-descriptions-item label="操作通过率">
            {{ reportData.report.summary.totalActions > 0 
              ? ((reportData.report.summary.passedActions / reportData.report.summary.totalActions) * 100).toFixed(2) 
              : 0 }}%
          </el-descriptions-item>
          <el-descriptions-item label="预期结果总数">{{ reportData.report.summary.totalExpectedResults }}</el-descriptions-item>
          <el-descriptions-item label="预期结果匹配">{{ reportData.report.summary.matchedExpectedResults }}</el-descriptions-item>
          <el-descriptions-item label="预期结果未匹配">{{ reportData.report.summary.unmatchedExpectedResults }}</el-descriptions-item>
          <el-descriptions-item label="预期结果匹配率">
            {{ reportData.report.summary.totalExpectedResults > 0 
              ? ((reportData.report.summary.matchedExpectedResults / reportData.report.summary.totalExpectedResults) * 100).toFixed(2) 
              : 0 }}%
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 用例执行结果列表 -->
      <el-card class="section-card">
        <template #header>
          <h3>用例执行结果</h3>
        </template>
        <el-table :data="reportData.report?.results || []" border style="width: 100%">
          <el-table-column type="index" label="#" width="60" />
          <el-table-column prop="testCase.id" label="用例ID" width="150" />
          <el-table-column prop="testCase.title" label="用例名称" min-width="200" />
          <el-table-column prop="testCase.module" label="功能模块" width="120" />
          <el-table-column label="执行状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.success ? 'success' : 'danger'">
                {{ row.success ? '✅ 通过' : '❌ 失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="100">
            <template #default="{ row }">
              {{ formatDuration(row.duration) }}
            </template>
          </el-table-column>
          <el-table-column label="操作统计" width="150">
            <template #default="{ row }">
              <span v-if="row.summary">
                {{ row.summary.passedActions }}/{{ row.summary.totalActions }}
              </span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="预期结果匹配" width="150">
            <template #default="{ row }">
              <span v-if="row.summary">
                {{ row.summary.matchedExpectedResults }}/{{ row.summary.totalExpectedResults }}
              </span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="错误信息" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.error" style="color: #f56c6c">{{ row.error }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="viewCaseDetail(row)">
                查看详情
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-card>

    <div v-else-if="loading" style="text-align: center; padding: 40px;">
      <el-icon class="is-loading" :size="40"><Loading /></el-icon>
      <p style="margin-top: 20px;">加载中...</p>
    </div>

    <!-- 用例详情对话框 -->
    <el-dialog
      v-model="caseDetailVisible"
      :title="`用例执行详情 - ${currentCase?.testCase?.id}`"
      width="90%"
      :close-on-click-modal="false"
    >
      <div v-if="currentCase">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="用例ID">{{ currentCase.testCase.id }}</el-descriptions-item>
          <el-descriptions-item label="用例名称">{{ currentCase.testCase.title }}</el-descriptions-item>
          <el-descriptions-item label="功能模块">{{ currentCase.testCase.module }}</el-descriptions-item>
          <el-descriptions-item label="优先级">{{ currentCase.testCase.priority }}</el-descriptions-item>
          <el-descriptions-item label="测试类型">{{ currentCase.testCase.testType }}</el-descriptions-item>
          <el-descriptions-item label="执行状态">
            <el-tag :type="currentCase.success ? 'success' : 'danger'">
              {{ currentCase.success ? '✅ 通过' : '❌ 失败' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="执行时间">{{ formatDuration(currentCase.duration) }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ formatTime(currentCase.startTime) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间" :span="2">{{ formatTime(currentCase.endTime) }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="currentCase.error" style="margin-top: 20px;">
          <el-alert type="error" :title="currentCase.error" :closable="false" />
        </div>

        <!-- 前置条件 -->
        <div v-if="currentCase.testCase.preconditions && currentCase.testCase.preconditions.length > 0" style="margin-top: 20px;">
          <h4>前置条件</h4>
          <ul>
            <li v-for="(precondition, idx) in currentCase.testCase.preconditions" :key="idx">
              {{ precondition }}
            </li>
          </ul>
        </div>

        <!-- 测试步骤 -->
        <div v-if="currentCase.testCase.steps && currentCase.testCase.steps.length > 0" style="margin-top: 20px;">
          <h4>测试步骤</h4>
          <ol>
            <li v-for="(step, idx) in currentCase.testCase.steps" :key="idx">
              {{ step }}
            </li>
          </ol>
        </div>

        <!-- 操作执行详情 -->
        <div v-if="currentCase.actionResults && currentCase.actionResults.length > 0" style="margin-top: 20px;">
          <h4>操作执行详情</h4>
          <el-table :data="currentCase.actionResults" border>
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
            <el-table-column label="耗时(ms)" width="100">
              <template #default="{ row }">
                {{ row.duration ? row.duration.toFixed(0) : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="result.message" label="执行结果" min-width="200" />
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button size="small" @click="viewActionDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 预期结果检查 -->
        <div v-if="currentCase.expectedResultsCheck && currentCase.expectedResultsCheck.length > 0" style="margin-top: 20px;">
          <h4>预期结果检查</h4>
          <el-table :data="currentCase.expectedResultsCheck" border>
            <el-table-column type="index" label="#" width="60" />
            <el-table-column prop="expected" label="预期结果" min-width="200" />
            <el-table-column prop="actual" label="实际结果" min-width="200" />
            <el-table-column label="匹配状态" width="120">
              <template #default="{ row }">
                <el-tag :type="row.matched ? 'success' : 'danger'" size="small">
                  {{ row.matched ? '✅ 匹配' : '❌ 未匹配' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="matchType" label="匹配类型" width="120" />
          </el-table>
        </div>
      </div>
    </el-dialog>

    <!-- 操作详情对话框 -->
    <el-dialog
      v-model="actionDetailVisible"
      title="操作执行详情"
      width="80%"
    >
      <div v-if="currentAction">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="操作类型">{{ currentAction.action.type }}</el-descriptions-item>
          <el-descriptions-item label="描述">{{ currentAction.action.description }}</el-descriptions-item>
          <el-descriptions-item label="执行状态">
            <el-tag :type="currentAction.result.success ? 'success' : 'danger'">
              {{ currentAction.result.success ? '✅ 成功' : '❌ 失败' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="耗时">{{ currentAction.duration ? currentAction.duration.toFixed(0) + 'ms' : '-' }}</el-descriptions-item>
          <el-descriptions-item label="执行时间" :span="2">{{ formatTime(currentAction.timestamp) }}</el-descriptions-item>
          <el-descriptions-item label="执行结果" :span="2">{{ currentAction.result.message || '-' }}</el-descriptions-item>
          <el-descriptions-item label="选择器" v-if="currentAction.action.selector" :span="2">
            <code>{{ currentAction.action.selector }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="URL" v-if="currentAction.action.url" :span="2">{{ currentAction.action.url }}</el-descriptions-item>
          <el-descriptions-item label="输入文本" v-if="currentAction.action.text" :span="2">{{ currentAction.action.text }}</el-descriptions-item>
          <el-descriptions-item label="错误信息" v-if="currentAction.result.error" :span="2">
            <el-alert type="error" :title="currentAction.result.error" :closable="false" />
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Back, Loading } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'

const route = useRoute()
const router = useRouter()
const executionId = ref('')
const reportData = ref<any>(null)
const loading = ref(false)
const caseDetailVisible = ref(false)
const currentCase = ref<any>(null)
const actionDetailVisible = ref(false)
const currentAction = ref<any>(null)

const passRate = computed(() => {
  if (!reportData.value?.report) return 0
  const total = reportData.value.report.total
  const passed = reportData.value.report.passed
  return total > 0 ? (passed / total) * 100 : 0
})

const getStatusType = (status?: string) => {
  const map: Record<string, string> = {
    pending: 'info',
    running: 'warning',
    completed: 'success',
    failed: 'danger',
  }
  return map[status || ''] || 'info'
}

const getStatusLabel = (status?: string) => {
  const map: Record<string, string> = {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
  }
  return map[status || ''] || status || '-'
}

const getEvaluationType = (overall?: string) => {
  const map: Record<string, string> = {
    excellent: 'success',
    good: 'success',
    fair: 'warning',
    poor: 'danger',
  }
  return map[overall || ''] || 'info'
}

const getEvaluationLabel = (overall?: string) => {
  const map: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    fair: '一般',
    poor: '较差',
  }
  return map[overall || ''] || '-'
}

const getProgressColor = (percentage: number) => {
  if (percentage >= 95) return '#67c23a'
  if (percentage >= 80) return '#e6a23c'
  if (percentage >= 60) return '#f56c6c'
  return '#909399'
}

const formatTime = (time?: Date | string) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

const formatDuration = (duration?: number) => {
  if (!duration) return '-'
  if (duration < 1000) return `${duration}ms`
  return `${(duration / 1000).toFixed(2)}s`
}

const loadReport = async () => {
  loading.value = true
  try {
    const response = await api.get(`/executions/${executionId.value}/report`)
    if (response.success) {
      reportData.value = response.data
    } else {
      ElMessage.error(response.error || '加载失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const refreshReport = () => {
  loadReport()
}

const goBack = () => {
  router.back()
}

const viewCaseDetail = (row: any) => {
  currentCase.value = row
  caseDetailVisible.value = true
}

const viewActionDetail = (row: any) => {
  currentAction.value = row
  actionDetailVisible.value = true
}

onMounted(() => {
  executionId.value = route.params.executionId as string
  loadReport()
})
</script>

<style scoped>
.suite-report-page {
  max-width: 1600px;
  margin: 0 auto;
}

.card-header {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-card {
  margin-bottom: 20px;
}

.stat-card {
  text-align: center;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
}

.stat-card.success {
  background: #f0f9ff;
  border: 2px solid #67c23a;
}

.stat-card.danger {
  background: #fef0f0;
  border: 2px solid #f56c6c;
}

.stat-value {
  font-size: 28px;
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

.evaluation-section {
  padding: 10px;
}

.evaluation-overall {
  text-align: center;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
}

.overall-label {
  font-size: 16px;
  color: #909399;
  margin-bottom: 10px;
}

.overall-tag {
  font-size: 20px;
  padding: 10px 20px;
}

.metric-item {
  padding: 15px;
  background: #f5f7fa;
  border-radius: 8px;
}

.metric-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 10px;
}

.recommendations {
  padding: 15px;
  background: #f5f7fa;
  border-radius: 8px;
}

.recommendations h4 {
  margin-bottom: 10px;
  color: #303133;
}

.recommendations ul {
  margin: 0;
  padding-left: 20px;
}

.recommendations li {
  margin-bottom: 8px;
  color: #606266;
  line-height: 1.6;
}
</style>

