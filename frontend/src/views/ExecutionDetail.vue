<template>
  <div class="execution-detail-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>用例集执行详情 - {{ executionId }}</span>
          <el-button @click="refreshExecution">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>

      <div v-if="execution" class="execution-info">
        <!-- 执行概览 -->
        <el-card class="overview-card">
          <el-row :gutter="20">
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">执行状态</div>
                <div class="stat-value">
                  <el-tag :type="getStatusType(execution.status)" size="large">
                    {{ getStatusLabel(execution.status) }}
                  </el-tag>
                </div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">总用例数</div>
                <div class="stat-value">{{ execution.totalCases }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item success">
                <div class="stat-label">通过</div>
                <div class="stat-value">{{ execution.passedCases }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item danger">
                <div class="stat-label">失败</div>
                <div class="stat-value">{{ execution.failedCases }}</div>
              </div>
            </el-col>
          </el-row>
          <el-row :gutter="20" style="margin-top: 20px;">
            <el-col :span="8">
              <div class="info-item">
                <strong>开始时间:</strong> {{ formatTime(execution.startTime) }}
              </div>
            </el-col>
            <el-col :span="8">
              <div class="info-item">
                <strong>结束时间:</strong> {{ formatTime(execution.endTime) }}
              </div>
            </el-col>
            <el-col :span="8">
              <div class="info-item">
                <strong>总耗时:</strong> {{ execution.duration ? (execution.duration / 1000).toFixed(2) + 's' : '-' }}
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 用例执行结果列表 -->
        <el-card class="results-card" style="margin-top: 20px;">
          <template #header>
            <span>用例执行结果</span>
          </template>
          <el-table :data="execution.results" style="width: 100%">
            <el-table-column type="index" label="#" width="60" />
            <el-table-column prop="testCase.id" label="用例ID" width="150" />
            <el-table-column prop="testCase.title" label="用例名称" min-width="200" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getResultStatusType(row.status)">
                  {{ getResultStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="开始时间" width="180">
              <template #default="{ row }">
                {{ formatTime(row.startTime) }}
              </template>
            </el-table-column>
            <el-table-column label="结束时间" width="180">
              <template #default="{ row }">
                {{ formatTime(row.endTime) }}
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="100">
              <template #default="{ row }">
                {{ row.duration ? (row.duration / 1000).toFixed(2) + 's' : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="错误信息" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.error" style="color: #f56c6c">{{ row.error }}</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="handleViewCaseDetail(row)">
                  查看详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>

      <div v-else-if="loading" style="text-align: center; padding: 40px;">
        <el-icon class="is-loading" :size="40"><Loading /></el-icon>
        <p style="margin-top: 20px;">加载中...</p>
      </div>
    </el-card>

    <!-- 用例详情对话框 -->
    <el-dialog
      v-model="caseDetailVisible"
      title="用例执行详情"
      width="90%"
      :close-on-click-modal="false"
    >
      <div v-if="currentCaseResult">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="用例ID">{{ currentCaseResult.testCase?.id }}</el-descriptions-item>
          <el-descriptions-item label="用例名称">{{ currentCaseResult.testCase?.title }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getResultStatusType(currentCaseResult.status)">
              {{ getResultStatusLabel(currentCaseResult.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="耗时">
            {{ currentCaseResult.duration ? (currentCaseResult.duration / 1000).toFixed(2) + 's' : '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="currentCaseResult.error" style="margin-top: 20px;">
          <el-alert type="error" :title="currentCaseResult.error" :closable="false" />
        </div>

        <!-- 测试结果详情 -->
        <div v-if="currentCaseResult.testResult" style="margin-top: 20px;">
          <el-card>
            <template #header>
              <span>测试执行详情</span>
            </template>
            <div v-if="currentCaseResult.testResult.actionResults">
              <h4>操作执行详情</h4>
              <el-table :data="currentCaseResult.testResult.actionResults" border>
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
                <el-table-column prop="result.message" label="执行结果" min-width="200" />
              </el-table>
            </div>
          </el-card>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Loading } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import { getExecution } from '@/api'

const route = useRoute()
const executionId = ref('')
const execution = ref<any>(null)
const loading = ref(false)
const caseDetailVisible = ref(false)
const currentCaseResult = ref<any>(null)
let refreshTimer: any = null

const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    pending: 'info',
    running: 'warning',
    completed: 'success',
    failed: 'danger',
  }
  return map[status] || 'info'
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
  }
  return map[status] || status
}

const getResultStatusType = (status: string) => {
  const map: Record<string, string> = {
    pending: 'info',
    running: 'warning',
    success: 'success',
    failed: 'danger',
  }
  return map[status] || 'info'
}

const getResultStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending: '待执行',
    running: '执行中',
    success: '成功',
    failed: '失败',
  }
  return map[status] || status
}

const formatTime = (time?: Date | string) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

const loadExecution = async () => {
  loading.value = true
  try {
    const response = await getExecution(executionId.value)
    if (response.success) {
      execution.value = response.data
      
      // 如果还在执行中，设置定时刷新
      if (execution.value.status === 'running') {
        if (!refreshTimer) {
          refreshTimer = setInterval(() => {
            loadExecution()
          }, 3000) // 每3秒刷新一次
        }
      } else {
        // 执行完成，清除定时器
        if (refreshTimer) {
          clearInterval(refreshTimer)
          refreshTimer = null
        }
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const refreshExecution = () => {
  loadExecution()
}

const handleViewCaseDetail = (row: any) => {
  currentCaseResult.value = row
  caseDetailVisible.value = true
}

onMounted(() => {
  executionId.value = route.params.executionId as string
  loadExecution()
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<style scoped>
.execution-detail-page {
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

.overview-card {
  margin-bottom: 20px;
}

.stat-item {
  text-align: center;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
}

.stat-item.success {
  background: #f0f9ff;
  border: 2px solid #67c23a;
}

.stat-item.danger {
  background: #fef0f0;
  border: 2px solid #f56c6c;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}

.stat-item.success .stat-value {
  color: #67c23a;
}

.stat-item.danger .stat-value {
  color: #f56c6c;
}

.info-item {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}
</style>

