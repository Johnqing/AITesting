<template>
  <div class="applications-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>应用分类管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增应用
          </el-button>
        </div>
      </template>

      <!-- 应用列表 -->
      <el-table :data="applications" v-loading="loading" style="width: 100%">
        <el-table-column prop="appId" label="应用ID" width="200" />
        <el-table-column prop="name" label="应用名称" min-width="200" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="appType" label="应用类型" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.appType" type="info">{{ getAppTypeLabel(row.appType) }}</el-tag>
            <span v-else style="color: #909399">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
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
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="应用ID" prop="appId" v-if="!isEdit">
          <el-input v-model="formData.appId" placeholder="请输入应用ID（如：warm-warm）" />
        </el-form-item>
        <el-form-item v-else label="应用ID">
          <el-input v-model="formData.appId" disabled />
        </el-form-item>
        <el-form-item label="应用名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入应用名称" />
        </el-form-item>
        <el-form-item label="应用类型" prop="appType">
          <el-select v-model="formData.appType" placeholder="请选择应用类型" style="width: 100%">
            <el-option label="移动应用" value="mobile_app" />
            <el-option label="Web应用" value="web_app" />
            <el-option label="桌面应用" value="desktop_app" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="4"
            placeholder="请输入应用描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getAllApplications,
  createApplication,
  updateApplication,
  deleteApplication,
} from '@/api'

const loading = ref(false)
const applications = ref<any[]>([])
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<any>(null)
const isEdit = ref(false)

const formData = ref({
  appId: '',
  name: '',
  description: '',
  appType: '',
})

const formRules = {
  appId: [{ required: true, message: '请输入应用ID', trigger: 'blur' }],
  name: [{ required: true, message: '请输入应用名称', trigger: 'blur' }],
}

const dialogTitle = computed(() => (isEdit.value ? '编辑应用' : '新增应用'))

const getAppTypeLabel = (appType: string) => {
  const map: Record<string, string> = {
    mobile_app: '移动应用',
    web_app: 'Web应用',
    desktop_app: '桌面应用',
    other: '其他',
  }
  return map[appType] || appType
}

const formatTime = (time?: Date | string) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

const loadApplications = async () => {
  loading.value = true
  try {
    const response = await getAllApplications()
    if (response.success) {
      applications.value = response.data || []
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  formData.value = {
    appId: '',
    name: '',
    description: '',
    appType: '',
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
    appId: row.appId,
    name: row.name,
    description: row.description || '',
    appType: row.appType || '',
  }
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    submitting.value = true
    try {
      if (isEdit.value) {
        await updateApplication(formData.value.appId, {
          name: formData.value.name,
          description: formData.value.description,
          appType: formData.value.appType,
        })
        ElMessage.success('更新成功')
      } else {
        await createApplication({
          appId: formData.value.appId,
          name: formData.value.name,
          description: formData.value.description,
          appType: formData.value.appType,
        })
        ElMessage.success('创建成功')
      }

      dialogVisible.value = false
      loadApplications()
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败')
    } finally {
      submitting.value = false
    }
  })
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除应用"${row.name}"吗？删除后，该应用下的PRD将变为未分类状态。`,
      '提示',
      {
        type: 'warning',
      }
    )
    await deleteApplication(row.appId)
    ElMessage.success('删除成功')
    loadApplications()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

onMounted(() => {
  loadApplications()
})
</script>

<style scoped>
.applications-page {
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
</style>

