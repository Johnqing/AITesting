<template>
  <div class="run-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>测试执行</span>
        </div>
      </template>

      <el-tabs v-model="activeTab" type="border-card">
        <!-- 运行所有 -->
        <el-tab-pane label="运行所有" name="all">
          <el-form :model="allForm" label-width="120px">
            <el-form-item label="用例目录">
              <el-input v-model="allForm.caseDir" placeholder="默认: case" />
            </el-form-item>
            <el-form-item label="输出目录">
              <el-input v-model="allForm.outputDir" placeholder="默认: reports" />
            </el-form-item>
            <el-form-item label="报告格式">
              <el-select v-model="allForm.format">
                <el-option label="Markdown" value="markdown" />
                <el-option label="JSON" value="json" />
                <el-option label="Both" value="both" />
                <el-option label="None" value="none" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleRunAll" :loading="running">
                <el-icon><VideoPlay /></el-icon>
                开始执行
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 运行文件 -->
        <el-tab-pane label="运行文件" name="file">
          <el-form :model="fileForm" label-width="120px">
            <el-form-item label="文件路径">
              <el-input v-model="fileForm.filePath" placeholder="例如: case/05-login.md" />
            </el-form-item>
            <el-form-item label="输出目录">
              <el-input v-model="fileForm.outputDir" placeholder="默认: reports" />
            </el-form-item>
            <el-form-item label="报告格式">
              <el-select v-model="fileForm.format">
                <el-option label="Markdown" value="markdown" />
                <el-option label="JSON" value="json" />
                <el-option label="Both" value="both" />
                <el-option label="None" value="none" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleRunFile" :loading="running">
                <el-icon><VideoPlay /></el-icon>
                开始执行
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 运行字符串 -->
        <el-tab-pane label="运行字符串" name="string">
          <el-form :model="stringForm" label-width="120px">
            <el-form-item label="用例内容">
              <el-input
                v-model="stringForm.content"
                type="textarea"
                :rows="10"
                placeholder="请输入 Markdown 格式的测试用例内容"
              />
            </el-form-item>
            <el-form-item label="入口URL">
              <el-input v-model="stringForm.entryUrl" placeholder="例如: https://example.com" />
            </el-form-item>
            <el-form-item label="输出目录">
              <el-input v-model="stringForm.outputDir" placeholder="默认: reports" />
            </el-form-item>
            <el-form-item label="报告格式">
              <el-select v-model="stringForm.format">
                <el-option label="Markdown" value="markdown" />
                <el-option label="JSON" value="json" />
                <el-option label="Both" value="both" />
                <el-option label="None" value="none" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleRunString" :loading="running">
                <el-icon><VideoPlay /></el-icon>
                开始执行
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <!-- 执行结果 -->
      <el-card v-if="runResult" class="result-card" shadow="never">
        <template #header>
          <span>执行结果</span>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="总用例数">{{ runResult.report?.total || 0 }}</el-descriptions-item>
          <el-descriptions-item label="通过数">
            <el-tag type="success">{{ runResult.report?.passed || 0 }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="失败数">
            <el-tag type="danger">{{ runResult.report?.failed || 0 }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="通过率">{{ runResult.report?.passRate || '0%' }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ formatDuration(runResult.report?.duration) }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ formatTime(runResult.report?.startTime) }}</el-descriptions-item>
        </el-descriptions>

        <el-table
          v-if="runResult.results?.length"
          :data="runResult.results"
          style="margin-top: 20px"
          max-height="400"
        >
          <el-table-column prop="testCase.id" label="用例ID" width="150" />
          <el-table-column prop="testCase.title" label="标题" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.success ? 'success' : 'danger'">
                {{ row.success ? '通过' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="100">
            <template #default="{ row }">
              {{ formatDuration(row.duration) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" @click="viewDetails(row)">查看详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 详情对话框 -->
      <el-dialog v-model="detailVisible" title="测试详情" width="80%">
        <el-descriptions v-if="selectedResult" :column="1" border>
          <el-descriptions-item label="用例ID">{{ selectedResult.testCase.id }}</el-descriptions-item>
          <el-descriptions-item label="标题">{{ selectedResult.testCase.title }}</el-descriptions-item>
          <el-descriptions-item label="模块">{{ selectedResult.testCase.module }}</el-descriptions-item>
          <el-descriptions-item label="优先级">{{ selectedResult.testCase.priority }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="selectedResult.success ? 'success' : 'danger'">
              {{ selectedResult.success ? '通过' : '失败' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="错误信息" v-if="selectedResult.error">
            <el-text type="danger">{{ selectedResult.error }}</el-text>
          </el-descriptions-item>
        </el-descriptions>

        <el-table
          v-if="selectedResult?.actionResults?.length"
          :data="selectedResult.actionResults"
          style="margin-top: 20px"
        >
          <el-table-column prop="action.type" label="操作类型" width="120" />
          <el-table-column prop="action.description" label="描述" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.success ? 'success' : 'danger'">
                {{ row.success ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="消息" />
        </el-table>
      </el-dialog>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPlay } from '@element-plus/icons-vue'
import { runAll, runFile, runString } from '@/api'

const activeTab = ref('all')
const running = ref(false)
const runResult = ref<any>(null)
const detailVisible = ref(false)
const selectedResult = ref<any>(null)

const allForm = ref({
  caseDir: 'case',
  outputDir: 'reports',
  format: 'both'
})

const fileForm = ref({
  filePath: 'case/05-login.md',
  outputDir: 'reports',
  format: 'both'
})

const stringForm = ref({
  content: `# 测试模块
## TC-TEST-001: 简单测试
**测试步骤**:
1. 导航到 https://example.com
**预期结果**:
- 页面加载成功`,
  entryUrl: 'https://example.com',
  outputDir: 'reports',
  format: 'both'
})

const handleRunAll = async () => {
  running.value = true
  runResult.value = null
  try {
    const data = await runAll(allForm.value)
    if (data.success) {
      runResult.value = data.data
      ElMessage.success('执行完成')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '执行失败')
  } finally {
    running.value = false
  }
}

const handleRunFile = async () => {
  if (!fileForm.value.filePath) {
    ElMessage.warning('请输入文件路径')
    return
  }

  running.value = true
  runResult.value = null
  try {
    const data = await runFile(fileForm.value)
    if (data.success) {
      runResult.value = data.data
      ElMessage.success('执行完成')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '执行失败')
  } finally {
    running.value = false
  }
}

const handleRunString = async () => {
  if (!stringForm.value.content) {
    ElMessage.warning('请输入用例内容')
    return
  }

  running.value = true
  runResult.value = null
  try {
    const data = await runString(stringForm.value)
    if (data.success) {
      runResult.value = data.data
      ElMessage.success('执行完成')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '执行失败')
  } finally {
    running.value = false
  }
}

const viewDetails = (result: any) => {
  selectedResult.value = result
  detailVisible.value = true
}

const formatDuration = (ms?: number) => {
  if (!ms) return '0ms'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const formatTime = (time?: string) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}
</script>

<style scoped>
.run-page {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  font-size: 18px;
  font-weight: 600;
}

.result-card {
  margin-top: 20px;
}
</style>

