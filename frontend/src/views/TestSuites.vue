<template>
  <div class="test-suites-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>用例集管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增用例集
          </el-button>
        </div>
      </template>

      <!-- 用例集列表 -->
      <el-table :data="testSuites" v-loading="loading" style="width: 100%">
        <el-table-column prop="suiteId" label="用例集ID" width="150" />
        <el-table-column prop="name" label="用例集名称" min-width="200" />
        <el-table-column prop="system" label="环境" width="120" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="用例数量" width="100">
          <template #default="{ row }">
            {{ row.testCases?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="success" @click="handleExecute(row)">执行</el-button>
            <el-button size="small" @click="handleViewExecutions(row)">执行记录</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="80%"
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
            <el-form-item label="用例集ID" prop="suiteId">
              <el-input v-model="formData.suiteId" disabled placeholder="用例集ID不可编辑" />
            </el-form-item>
          </el-col>
          <el-col :span="isEdit ? 12 : 24">
            <el-form-item label="用例集名称" prop="name">
              <el-input v-model="formData.name" placeholder="请输入用例集名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="环境" prop="system">
              <el-select v-model="formData.system" placeholder="请选择环境" style="width: 100%">
                <el-option label="生产环境" value="生产环境" />
                <el-option label="预发布环境" value="预发布环境" />
                <el-option label="测试环境" value="测试环境" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="创建人" prop="createdBy">
              <el-input v-model="formData.createdBy" placeholder="请输入创建人" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入用例集描述"
          />
        </el-form-item>
        <el-form-item label="测试用例" prop="testCases">
          <el-select
            v-model="formData.testCaseIds"
            multiple
            filterable
            placeholder="请选择测试用例"
            style="width: 100%"
          >
            <el-option
              v-for="testCase in allTestCases"
              :key="testCase.id"
              :label="`${testCase.id} - ${testCase.title}`"
              :value="testCase.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>

    <!-- 执行记录对话框 -->
    <el-dialog
      v-model="executionsDialogVisible"
      title="执行记录"
      width="90%"
      :close-on-click-modal="false"
    >
      <el-table :data="executions" v-loading="executionsLoading" style="width: 100%">
        <el-table-column prop="executionId" label="执行ID" width="200" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
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
        <el-table-column label="总用例数" width="100">
          <template #default="{ row }">
            {{ row.totalCases }}
          </template>
        </el-table-column>
        <el-table-column label="通过" width="100">
          <template #default="{ row }">
            <span style="color: #67c23a">{{ row.passedCases }}</span>
          </template>
        </el-table-column>
        <el-table-column label="失败" width="100">
          <template #default="{ row }">
            <span style="color: #f56c6c">{{ row.failedCases }}</span>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="100">
          <template #default="{ row }">
            {{ row.duration ? (row.duration / 1000).toFixed(2) + 's' : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleViewExecutionDetail(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import {
  getAllTestSuites,
  createTestSuite,
  updateTestSuite,
  deleteTestSuite,
  executeTestSuite,
  getSuiteExecutions,
  getAllTestCases,
} from '@/api'

const router = useRouter()
const loading = ref(false)
const testSuites = ref<any[]>([])
const allTestCases = ref<any[]>([])
const dialogVisible = ref(false)
const executionsDialogVisible = ref(false)
const submitting = ref(false)
const executionsLoading = ref(false)
const formRef = ref<any>(null)
const isEdit = ref(false)
const currentSuiteId = ref('')
const executions = ref<any[]>([])

const formData = ref({
  suiteId: '',
  name: '',
  system: '',
  description: '',
  createdBy: '',
  testCaseIds: [] as string[],
})

const formRules = {
  name: [{ required: true, message: '请输入用例集名称', trigger: 'blur' }],
}

const dialogTitle = computed(() => (isEdit.value ? '编辑用例集' : '新增用例集'))

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

const formatTime = (time?: Date | string) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

const loadTestSuites = async () => {
  loading.value = true
  try {
    const response = await getAllTestSuites()
    if (response.success) {
      testSuites.value = response.data || []
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadAllTestCases = async () => {
  try {
    const response = await getAllTestCases()
    if (response.success) {
      allTestCases.value = response.data || []
    }
  } catch (error: any) {
    console.error('加载测试用例失败:', error)
  }
}

const handleAdd = async () => {
  isEdit.value = false
  formData.value = {
    suiteId: '',
    name: '',
    system: '',
    description: '',
    createdBy: '',
    testCaseIds: [],
  }
  await loadAllTestCases()
  dialogVisible.value = true
}

const handleEdit = async (row: any) => {
  isEdit.value = true
  formData.value = {
    suiteId: row.suiteId,
    name: row.name,
    system: row.system || '',
    description: row.description || '',
    createdBy: row.createdBy || '',
    testCaseIds: (row.testCases || []).map((tc: any) => tc.id),
  }
  await loadAllTestCases()
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

  submitting.value = true
  try {
    // 新增时不需要传suiteId，后端会自动生成
    const data: any = {
      name: formData.value.name,
      system: formData.value.system || undefined,
      description: formData.value.description || undefined,
      createdBy: formData.value.createdBy || undefined,
      testCases: formData.value.testCaseIds.map((id) => ({ id })),
    }

    // 编辑时需要传suiteId
    if (isEdit.value) {
      data.suiteId = formData.value.suiteId
      await updateTestSuite(formData.value.suiteId, data)
      ElMessage.success('更新成功')
    } else {
      await createTestSuite(data)
      ElMessage.success('创建成功')
    }

      dialogVisible.value = false
      loadTestSuites()
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败')
    } finally {
      submitting.value = false
    }
  })
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要删除该用例集吗？', '提示', {
      type: 'warning',
    })
    await deleteTestSuite(row.suiteId)
    ElMessage.success('删除成功')
    loadTestSuites()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

const handleExecute = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要执行该用例集吗？', '提示', {
      type: 'info',
    })
    const response = await executeTestSuite(row.suiteId)
    if (response.success) {
      ElMessage.success('用例集执行已开始')
      // 跳转到执行页面
      router.push(`/executions/${response.data.executionId}`)
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '执行失败')
    }
  }
}

const handleViewExecutions = async (row: any) => {
  currentSuiteId.value = row.suiteId
  executionsDialogVisible.value = true
  await loadExecutions()
}

const loadExecutions = async () => {
  executionsLoading.value = true
  try {
    const response = await getSuiteExecutions(currentSuiteId.value)
    if (response.success) {
      executions.value = response.data || []
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载执行记录失败')
  } finally {
    executionsLoading.value = false
  }
}

const handleViewExecutionDetail = (row: any) => {
  router.push(`/executions/${row.executionId}`)
}

onMounted(() => {
  loadTestSuites()
})
</script>

<style scoped>
.test-suites-page {
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

