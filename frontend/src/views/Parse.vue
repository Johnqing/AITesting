<template>
  <div class="parse-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>用例解析</span>
        </div>
      </template>

      <el-tabs v-model="activeTab" type="border-card">
        <!-- 解析文件 -->
        <el-tab-pane label="解析文件" name="file">
          <el-form :model="fileForm" label-width="120px">
            <el-form-item label="文件路径">
              <el-input v-model="fileForm.filePath" placeholder="例如: case/05-login.md" />
            </el-form-item>
            <el-form-item label="用例目录">
              <el-input v-model="fileForm.caseDir" placeholder="默认: case" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleParseFile" :loading="loading">
                解析文件
              </el-button>
            </el-form-item>
          </el-form>

          <el-card v-if="fileResult" class="result-card" shadow="never">
            <template #header>
              <span>解析结果</span>
            </template>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="文件路径">{{ fileResult.filePath }}</el-descriptions-item>
              <el-descriptions-item label="模块">{{ fileResult.module }}</el-descriptions-item>
              <el-descriptions-item label="入口URL">{{ fileResult.entryUrl || '无' }}</el-descriptions-item>
              <el-descriptions-item label="测试用例数">{{ fileResult.testCases?.length || 0 }}</el-descriptions-item>
            </el-descriptions>

            <el-table v-if="fileResult.testCases?.length" :data="fileResult.testCases" style="margin-top: 20px">
              <el-table-column prop="id" label="用例ID" width="150" />
              <el-table-column prop="title" label="标题" />
              <el-table-column prop="priority" label="优先级" width="100" />
              <el-table-column prop="testType" label="测试类型" width="120" />
            </el-table>
          </el-card>
        </el-tab-pane>

        <!-- 解析字符串 -->
        <el-tab-pane label="解析字符串" name="string">
          <el-form :model="stringForm" label-width="120px">
            <el-form-item label="用例内容">
              <el-input
                v-model="stringForm.content"
                type="textarea"
                :rows="10"
                placeholder="请输入 Markdown 格式的测试用例内容"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleParseString" :loading="loading">
                解析字符串
              </el-button>
            </el-form-item>
          </el-form>

          <el-card v-if="stringResult" class="result-card" shadow="never">
            <template #header>
              <span>解析结果</span>
            </template>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="文件路径">{{ stringResult.filePath }}</el-descriptions-item>
              <el-descriptions-item label="模块">{{ stringResult.module || '无' }}</el-descriptions-item>
              <el-descriptions-item label="入口URL">{{ stringResult.entryUrl || '无' }}</el-descriptions-item>
              <el-descriptions-item label="测试用例数">{{ stringResult.testCases?.length || 0 }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-tab-pane>

        <!-- 解析目录 -->
        <el-tab-pane label="解析目录" name="directory">
          <el-form :model="dirForm" label-width="120px">
            <el-form-item label="目录路径">
              <el-input v-model="dirForm.dirPath" placeholder="默认: case" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleParseDirectory" :loading="loading">
                解析目录
              </el-button>
            </el-form-item>
          </el-form>

          <el-card v-if="dirResult" class="result-card" shadow="never">
            <template #header>
              <span>解析结果 ({{ dirResult.length }} 个文件)</span>
            </template>
            <el-table :data="dirResult">
              <el-table-column prop="filePath" label="文件路径" />
              <el-table-column prop="module" label="模块" />
              <el-table-column prop="entryUrl" label="入口URL" />
              <el-table-column prop="testCaseCount" label="用例数" width="100" />
            </el-table>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { parseFile, parseString, parseDirectory } from '@/api'

const activeTab = ref('file')
const loading = ref(false)

const fileForm = ref({
  filePath: 'case/05-login.md',
  caseDir: 'case'
})

const stringForm = ref({
  content: `# 测试模块
## TC-TEST-001: 测试用例
**功能模块**: 测试模块
**优先级**: P0
**测试类型**: 功能测试
**测试步骤**:
1. 导航到首页
2. 点击登录按钮
**预期结果**:
- 成功跳转`
})

const dirForm = ref({
  dirPath: 'case'
})

const fileResult = ref<any>(null)
const stringResult = ref<any>(null)
const dirResult = ref<any[]>([])

const handleParseFile = async () => {
  if (!fileForm.value.filePath) {
    ElMessage.warning('请输入文件路径')
    return
  }

  loading.value = true
  try {
    const data = await parseFile(fileForm.value)
    if (data.success) {
      fileResult.value = data.data
      ElMessage.success('解析成功')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '解析失败')
  } finally {
    loading.value = false
  }
}

const handleParseString = async () => {
  if (!stringForm.value.content) {
    ElMessage.warning('请输入用例内容')
    return
  }

  loading.value = true
  try {
    const data = await parseString({ content: stringForm.value.content })
    if (data.success) {
      stringResult.value = data.data
      ElMessage.success('解析成功')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '解析失败')
  } finally {
    loading.value = false
  }
}

const handleParseDirectory = async () => {
  loading.value = true
  try {
    const data = await parseDirectory({ dirPath: dirForm.value.dirPath || 'case' })
    if (data.success) {
      dirResult.value = data.data
      ElMessage.success(`解析成功，共 ${data.data.length} 个文件`)
    }
  } catch (error: any) {
    ElMessage.error(error.message || '解析失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.parse-page {
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

