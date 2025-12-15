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
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="viewReport(row.id, 'json')">查看 JSON</el-button>
            <el-button size="small" type="primary" @click="viewReport(row.id, 'markdown')">
              查看 Markdown
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 报告详情对话框 -->
      <el-dialog v-model="reportVisible" :title="`报告详情 - ${currentReportId}`" width="90%">
        <el-tabs v-model="reportTab">
          <el-tab-pane label="JSON" name="json">
            <el-input
              v-model="reportContent"
              type="textarea"
              :rows="20"
              readonly
              v-if="reportTab === 'json'"
            />
          </el-tab-pane>
          <el-tab-pane label="Markdown" name="markdown">
            <div class="markdown-content" v-html="markdownHtml" v-if="reportTab === 'markdown'"></div>
          </el-tab-pane>
        </el-tabs>
      </el-dialog>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { listReports, getReport } from '@/api'

const loading = ref(false)
const reports = ref<any[]>([])
const reportVisible = ref(false)
const currentReportId = ref('')
const reportTab = ref('json')
const reportContent = ref('')
const markdownHtml = ref('')

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

const viewReport = async (reportId: string, format: string) => {
  currentReportId.value = reportId
  reportTab.value = format
  reportVisible.value = true

  try {
    const response = await getReport(reportId, format)
    if (format === 'markdown') {
      // Markdown 格式返回的是文本
      markdownHtml.value = (response as string)
        .replace(/\n/g, '<br>')
        .replace(/## (.*?)(<br>|$)/g, '<h2>$1</h2>')
        .replace(/# (.*?)(<br>|$)/g, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
    } else {
      // JSON 格式
      const data = typeof response === 'string' ? JSON.parse(response) : response
      reportContent.value = JSON.stringify(data.data || data, null, 2)
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载报告失败')
  }
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
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
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
</style>

