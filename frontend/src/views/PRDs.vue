<template>
  <div class="prds-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>PRD 管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增 PRD
          </el-button>
        </div>
      </template>

      <!-- PRD 列表 -->
      <el-table :data="prds" v-loading="loading" style="width: 100%">
        <el-table-column prop="prdId" label="PRD ID" width="200" />
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="author" label="作者" width="120" />
        <el-table-column label="生成的用例数" width="120">
          <template #default="{ row }">
            {{ getGeneratedCaseCount(row.prdId) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="380" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleView(row)">查看</el-button>
            <el-button size="small" @click="handleExportMarkdown(row)">导出</el-button>
            <el-button size="small" type="success" @click="handleGenerate(row)">生成用例</el-button>
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="90%"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
      >
        <el-row :gutter="20">
          <el-col :span="12" v-if="isEdit">
            <el-form-item label="PRD ID" prop="prdId">
              <el-input v-model="formData.prdId" disabled placeholder="PRD ID不可编辑" />
            </el-form-item>
          </el-col>
          <el-col :span="isEdit ? 12 : 24">
            <el-form-item label="标题" prop="title">
              <el-input v-model="formData.title" placeholder="请输入PRD标题" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="版本" prop="version">
              <el-input v-model="formData.version" placeholder="如：1.0.0" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="formData.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="草稿" value="draft" />
                <el-option label="评审中" value="reviewing" />
                <el-option label="已通过" value="approved" />
                <el-option label="已发布" value="published" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="作者" prop="author">
              <el-input v-model="formData.author" placeholder="请输入作者" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入PRD描述"
          />
        </el-form-item>
        <el-form-item label="PRD 内容" prop="content">
          <el-input
            v-model="formData.content"
            type="textarea"
            :rows="15"
            placeholder="请输入PRD内容（Markdown格式）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>

    <!-- 查看 PRD 对话框 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="PRD 详情"
      width="90%"
      :close-on-click-modal="false"
    >
      <el-descriptions :column="2" border v-if="currentPRD">
        <el-descriptions-item label="PRD ID">{{ currentPRD.prdId }}</el-descriptions-item>
        <el-descriptions-item label="标题">{{ currentPRD.title }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ currentPRD.version }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentPRD.status)">{{ getStatusLabel(currentPRD.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="作者">{{ currentPRD.author || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(currentPRD.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">{{ currentPRD.description || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-divider />
      <div class="prd-content">
        <el-scrollbar height="500px">
          <div v-html="renderMarkdown(currentPRD?.content || '')" class="markdown-content"></div>
        </el-scrollbar>
      </div>
      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
        <el-button @click="handleExportMarkdown(currentPRD)" v-if="currentPRD">导出Markdown</el-button>
        <el-button type="primary" @click="handleGenerateFromView">生成测试用例</el-button>
      </template>
    </el-dialog>

    <!-- 生成测试用例对话框 -->
    <el-dialog
      v-model="generateDialogVisible"
      title="生成测试用例"
      width="80%"
      :close-on-click-modal="false"
      :close-on-press-escape="!generating"
    >
      <el-alert
        :type="generatedTestCases.length > 0 ? 'success' : 'info'"
        :closable="false"
        style="margin-bottom: 20px"
      >
        <template #default>
          <div>
            <p v-if="generating">正在使用 AI 分析 PRD 并生成测试用例，这可能需要一些时间，请稍候...</p>
            <p v-else-if="generatedTestCases.length > 0">
              成功生成 {{ generatedTestCases.length }} 个测试用例！
            </p>
            <p v-else>准备生成测试用例...</p>
          </div>
        </template>
      </el-alert>
      <el-form label-width="120px" v-if="!generating && generatedTestCases.length === 0">
        <el-form-item label="保存到数据库">
          <el-switch v-model="generateOptions.saveToDatabase" />
        </el-form-item>
      </el-form>
      <div v-if="generatedTestCases.length > 0" style="margin-top: 20px">
        <h3>生成的测试用例（{{ generatedTestCases.length }} 个）</h3>
        <el-table :data="generatedTestCases" max-height="400" style="margin-top: 10px">
          <el-table-column prop="id" label="用例ID" width="150" />
          <el-table-column prop="title" label="标题" min-width="200" />
          <el-table-column prop="module" label="模块" width="120" />
          <el-table-column prop="priority" label="优先级" width="100">
            <template #default="{ row }">
              <el-tag :type="getPriorityType(row.priority)">{{ row.priority }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="testType" label="测试类型" width="120" />
        </el-table>
      </div>
      <template #footer>
        <el-button @click="generateDialogVisible = false" :disabled="generating">关闭</el-button>
        <el-button
          v-if="generatedTestCases.length === 0"
          type="primary"
          @click="handleConfirmGenerate"
          :loading="generating"
        >
          {{ generating ? '生成中...' : '开始生成' }}
        </el-button>
        <el-button
          v-else
          type="success"
          @click="handleViewTestCases"
        >
          查看测试用例
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getAllPRDs,
  createPRD,
  updatePRD,
  deletePRD,
  generateTestCasesFromPRD,
  getPRDGeneratedTestCases,
  exportPRDAsMarkdownFile,
} from '@/api'
import { renderMarkdown } from '@/utils/markdown'

const router = useRouter()

const loading = ref(false)
const prds = ref<any[]>([])
const dialogVisible = ref(false)
const viewDialogVisible = ref(false)
const generateDialogVisible = ref(false)
const submitting = ref(false)
const generating = ref(false)
const formRef = ref<any>(null)
const isEdit = ref(false)
const currentPRD = ref<any>(null)
const generatedTestCases = ref<any[]>([])
const generatedCaseCounts = ref<Record<string, number>>({})

const generateOptions = ref({
  saveToDatabase: true,
})

const formData = ref({
  prdId: '',
  title: '',
  description: '',
  content: '',
  version: '1.0.0',
  status: 'draft',
  author: '',
})

const formRules = {
  title: [{ required: true, message: '请输入PRD标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入PRD内容', trigger: 'blur' }],
}

const dialogTitle = computed(() => (isEdit.value ? '编辑 PRD' : '新增 PRD'))

const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    draft: 'info',
    reviewing: 'warning',
    approved: 'success',
    published: 'success',
  }
  return map[status] || 'info'
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    draft: '草稿',
    reviewing: '评审中',
    approved: '已通过',
    published: '已发布',
  }
  return map[status] || status
}

const getPriorityType = (priority: string) => {
  const map: Record<string, string> = {
    P0: 'danger',
    P1: 'warning',
    P2: 'info',
  }
  return map[priority] || 'info'
}

const formatTime = (time?: Date | string) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}


const getGeneratedCaseCount = (prdId: string) => {
  return generatedCaseCounts.value[prdId] || 0
}

const loadPRDs = async () => {
  loading.value = true
  try {
    const response = await getAllPRDs()
    if (response.success) {
      prds.value = response.data || []
      // 加载每个 PRD 生成的用例数量
      for (const prd of prds.value) {
        try {
          const casesResponse = await getPRDGeneratedTestCases(prd.prdId)
          if (casesResponse.success) {
            generatedCaseCounts.value[prd.prdId] = casesResponse.data?.length || 0
          }
        } catch (error) {
          console.error(`Failed to load test cases for PRD ${prd.prdId}:`, error)
        }
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  formData.value = {
    prdId: '',
    title: '',
    description: '',
    content: '',
    version: '1.0.0',
    status: 'draft',
    author: '',
  }
}

const handleAdd = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

const handleEdit = (row: any) => {
  isEdit.value = true
  formData.value = {
    prdId: row.prdId,
    title: row.title,
    description: row.description || '',
    content: row.content,
    version: row.version || '1.0.0',
    status: row.status || 'draft',
    author: row.author || '',
  }
  dialogVisible.value = true
}

const handleView = (row: any) => {
  currentPRD.value = row
  viewDialogVisible.value = true
}

const handleExportMarkdown = async (row: any) => {
  try {
    await exportPRDAsMarkdownFile(row.prdId)
    ElMessage.success('导出成功')
  } catch (error: any) {
    ElMessage.error(error.message || '导出失败')
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    submitting.value = true
    try {
      const submitData = { ...formData.value }
      if (!isEdit.value) {
        delete submitData.prdId
      }

      if (isEdit.value) {
        await updatePRD(formData.value.prdId, submitData)
        ElMessage.success('更新成功')
      } else {
        await createPRD(submitData)
        ElMessage.success('创建成功')
      }

      dialogVisible.value = false
      loadPRDs()
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败')
    } finally {
      submitting.value = false
    }
  })
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要删除该 PRD 吗？', '提示', {
      type: 'warning',
    })
    await deletePRD(row.prdId)
    ElMessage.success('删除成功')
    loadPRDs()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

const handleGenerate = async (row: any) => {
  currentPRD.value = row
  generateDialogVisible.value = true
  generatedTestCases.value = []
  generating.value = false
}

const handleGenerateFromView = () => {
  viewDialogVisible.value = false
  handleGenerate(currentPRD.value)
}

const handleConfirmGenerate = async () => {
  if (!currentPRD.value) return

  generating.value = true
  try {
    const response = await generateTestCasesFromPRD(
      currentPRD.value.prdId,
      generateOptions.value.saveToDatabase
    )

    if (response.success) {
      generatedTestCases.value = response.data.testCases || []
      ElMessage.success(`成功生成 ${generatedTestCases.value.length} 个测试用例`)
      
      // 更新用例数量
      generatedCaseCounts.value[currentPRD.value.prdId] = generatedTestCases.value.length
      
      // 如果保存到数据库，刷新列表
      if (generateOptions.value.saveToDatabase) {
        ElMessage.info('测试用例已保存到数据库，可在测试用例管理中查看')
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成测试用例失败')
  } finally {
    generating.value = false
  }
}

const handleViewTestCases = () => {
  generateDialogVisible.value = false
  // 跳转到测试用例页面
  router.push('/test-cases')
}

onMounted(() => {
  loadPRDs()
})
</script>

<style scoped>
.prds-page {
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

.prd-content {
  margin-top: 20px;
}

.markdown-content {
  padding: 20px;
  line-height: 1.8;
}

.markdown-content :deep(h1) {
  font-size: 28px;
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid #e4e7ed;
}

.markdown-content :deep(h2) {
  font-size: 24px;
  font-weight: 600;
  margin-top: 20px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e4e7ed;
}

.markdown-content :deep(h3) {
  font-size: 20px;
  font-weight: 600;
  margin-top: 16px;
  margin-bottom: 10px;
}

.markdown-content :deep(h4) {
  font-size: 18px;
  font-weight: 600;
  margin-top: 14px;
  margin-bottom: 8px;
}

.markdown-content :deep(p) {
  margin-bottom: 12px;
  line-height: 1.8;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin-bottom: 12px;
  padding-left: 30px;
}

.markdown-content :deep(li) {
  margin-bottom: 6px;
  line-height: 1.8;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #409eff;
  padding-left: 16px;
  margin: 16px 0;
  color: #666;
  background: #f5f7fa;
  padding: 12px 16px;
}

.markdown-content :deep(code) {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', 'Monaco', 'Consolas', monospace;
  font-size: 0.9em;
  color: #e83e8c;
}

.markdown-content :deep(pre) {
  background: #f5f7fa;
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 16px 0;
  border: 1px solid #e4e7ed;
}

.markdown-content :deep(pre code) {
  background: transparent;
  padding: 0;
  color: #333;
  font-size: 14px;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid #e4e7ed;
  padding: 8px 12px;
  text-align: left;
}

.markdown-content :deep(th) {
  background: #f5f7fa;
  font-weight: 600;
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid #e4e7ed;
  margin: 24px 0;
}

.markdown-content :deep(a) {
  color: #409eff;
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 16px 0;
}
</style>

