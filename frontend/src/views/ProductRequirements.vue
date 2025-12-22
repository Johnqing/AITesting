<template>
  <div class="product-requirements-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>产品需求管理</span>
          <el-tag type="info" size="small">管理从需求说明生成的PRD文档</el-tag>
        </div>
      </template>

      <!-- 产品需求列表 -->
      <el-table :data="productRequirements" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="200" />
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="源需求说明" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.sourcePrdId" type="info" size="small">{{ row.sourcePrdId }}</el-tag>
            <span v-else style="color: #909399">无</span>
          </template>
        </el-table-column>
        <el-table-column prop="author" label="作者" width="120" />
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleView(row)">查看</el-button>
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" @click="handleDownload(row)">下载</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 查看对话框 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="产品需求详情"
      width="90%"
      :close-on-click-modal="false"
    >
      <el-descriptions :column="2" border v-if="currentPRD">
        <el-descriptions-item label="ID">{{ currentPRD.id }}</el-descriptions-item>
        <el-descriptions-item label="标题">{{ currentPRD.title }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ currentPRD.version }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentPRD.status)">{{ getStatusLabel(currentPRD.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="源需求说明">
          <el-tag v-if="currentPRD.sourcePrdId" type="info">{{ currentPRD.sourcePrdId }}</el-tag>
          <span v-else style="color: #909399">无</span>
        </el-descriptions-item>
        <el-descriptions-item label="作者">{{ currentPRD.author || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(currentPRD.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatTime(currentPRD.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">{{ currentPRD.description || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-divider />
      <div class="prd-content">
        <el-scrollbar height="500px">
          <div v-html="renderMarkdown(currentPRD?.prdContent || '')" class="markdown-content"></div>
        </el-scrollbar>
      </div>
      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
        <el-button @click="handleDownload(currentPRD)" v-if="currentPRD">下载Markdown</el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="editDialogVisible"
      title="编辑产品需求"
      width="90%"
      :close-on-click-modal="false"
    >
      <el-form
        ref="editFormRef"
        :model="editForm"
        :rules="editFormRules"
        label-width="120px"
      >
        <el-form-item label="标题" prop="title">
          <el-input v-model="editForm.title" placeholder="请输入标题" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="版本" prop="version">
              <el-input v-model="editForm.version" placeholder="如：1.0.0" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="editForm.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="草稿" value="draft" />
                <el-option label="评审中" value="reviewing" />
                <el-option label="已通过" value="approved" />
                <el-option label="已发布" value="published" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="作者" prop="author">
          <el-input v-model="editForm.author" placeholder="请输入作者" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="editForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述"
          />
        </el-form-item>
        <el-form-item label="PRD内容" prop="prdContent">
          <el-input
            v-model="editForm.prdContent"
            type="textarea"
            :rows="15"
            placeholder="请输入PRD内容（Markdown格式）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleUpdate" :loading="updating">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getAllDirectGeneratedPRDs,
  getDirectGeneratedPRDById,
  updateDirectGeneratedPRD,
  deleteDirectGeneratedPRD,
} from '@/api'
import { renderMarkdown } from '@/utils/markdown'

const loading = ref(false)
const updating = ref(false)
const productRequirements = ref<any[]>([])
const viewDialogVisible = ref(false)
const editDialogVisible = ref(false)
const currentPRD = ref<any>(null)
const editFormRef = ref<any>(null)

const editForm = ref({
  id: '',
  title: '',
  description: '',
  prdContent: '',
  version: '1.0.0',
  status: 'draft',
  author: ''
})

const editFormRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  prdContent: [{ required: true, message: '请输入PRD内容', trigger: 'blur' }],
}

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

const formatTime = (time?: Date | string) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

const loadProductRequirements = async () => {
  loading.value = true
  try {
    const response = await getAllDirectGeneratedPRDs()
    if (response.success) {
      productRequirements.value = response.data || []
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const handleView = async (row: any) => {
  try {
    const response = await getDirectGeneratedPRDById(row.id)
    if (response.success) {
      currentPRD.value = response.data
      viewDialogVisible.value = true
    }
  } catch (error: any) {
    ElMessage.error(error.message || '获取详情失败')
  }
}

const handleEdit = async (row: any) => {
  try {
    const response = await getDirectGeneratedPRDById(row.id)
    if (response.success) {
      const prd = response.data
      editForm.value = {
        id: prd.id,
        title: prd.title,
        description: prd.description || '',
        prdContent: prd.prdContent,
        version: prd.version || '1.0.0',
        status: prd.status || 'draft',
        author: prd.author || ''
      }
      editDialogVisible.value = true
    }
  } catch (error: any) {
    ElMessage.error(error.message || '获取详情失败')
  }
}

const handleUpdate = async () => {
  if (!editFormRef.value) return

  try {
    await editFormRef.value.validate()
  } catch (error) {
    return
  }

  updating.value = true
  try {
    await updateDirectGeneratedPRD(editForm.value.id, {
      title: editForm.value.title,
      description: editForm.value.description || undefined,
      prdContent: editForm.value.prdContent,
      version: editForm.value.version,
      status: editForm.value.status,
      author: editForm.value.author || undefined
    })

    ElMessage.success('更新成功')
    editDialogVisible.value = false
    loadProductRequirements()
  } catch (error: any) {
    ElMessage.error(error.message || '更新失败')
  } finally {
    updating.value = false
  }
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要删除该产品需求吗？', '提示', {
      type: 'warning',
    })
    await deleteDirectGeneratedPRD(row.id)
    ElMessage.success('删除成功')
    loadProductRequirements()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

const handleDownload = (row: any) => {
  const content = row.prdContent || ''
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${row.title || 'PRD'}.md`
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
  ElMessage.success('文件下载成功')
}

onMounted(() => {
  loadProductRequirements()
})
</script>

<style scoped>
.product-requirements-page {
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

