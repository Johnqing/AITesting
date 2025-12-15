<template>
  <div class="test-cases-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>测试用例管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增用例
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="测试名称">
          <el-input v-model="searchForm.title" placeholder="请输入测试名称" clearable />
        </el-form-item>
        <el-form-item label="环境">
          <el-select v-model="searchForm.system" placeholder="请选择环境" clearable>
            <el-option label="生产环境" value="生产环境" />
            <el-option label="预发布环境" value="预发布环境" />
            <el-option label="测试环境" value="测试环境" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="searchForm.priority" placeholder="请选择优先级" clearable>
            <el-option label="P0" value="P0" />
            <el-option label="P1" value="P1" />
            <el-option label="P2" value="P2" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadTestCases">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 用例列表 -->
      <el-table :data="testCases" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="用例ID" width="150" />
        <el-table-column prop="title" label="测试名称" min-width="200" />
        <el-table-column prop="system" label="环境" width="120" />
        <el-table-column prop="module" label="功能模块" width="120" />
        <el-table-column prop="priority" label="优先级" width="100">
          <template #default="{ row }">
            <el-tag :type="getPriorityType(row.priority)">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="testObjective" label="测试目的" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.size"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadTestCases"
        @current-change="loadTestCases"
        style="margin-top: 20px; justify-content: flex-end"
      />
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
            <el-form-item label="用例ID" prop="id">
              <el-input v-model="formData.id" disabled placeholder="用例ID不可编辑" />
            </el-form-item>
          </el-col>
          <el-col :span="isEdit ? 12 : 24">
            <el-form-item label="测试名称" prop="title">
              <el-input v-model="formData.title" placeholder="请输入测试名称" />
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
            <el-form-item label="功能模块" prop="module">
              <el-input v-model="formData.module" placeholder="请输入功能模块" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="优先级" prop="priority">
              <el-select v-model="formData.priority" placeholder="请选择优先级" style="width: 100%">
                <el-option label="P0" value="P0" />
                <el-option label="P1" value="P1" />
                <el-option label="P2" value="P2" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="测试类型" prop="testType">
              <el-select v-model="formData.testType" placeholder="请选择测试类型" style="width: 100%">
                <el-option label="功能测试" value="功能测试" />
                <el-option label="性能测试" value="性能测试" />
                <el-option label="兼容性测试" value="兼容性测试" />
                <el-option label="安全测试" value="安全测试" />
                <el-option label="接口测试" value="接口测试" />
                <el-option label="UI测试" value="UI测试" />
                <el-option label="回归测试" value="回归测试" />
                <el-option label="冒烟测试" value="冒烟测试" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="测试目的" prop="testObjective">
          <el-input
            v-model="formData.testObjective"
            type="textarea"
            :rows="3"
            placeholder="请输入测试目的"
          />
        </el-form-item>
        <el-form-item label="入口URL" prop="entryUrl">
          <el-input v-model="formData.entryUrl" placeholder="如：https://example.com" />
        </el-form-item>
        <el-form-item label="前置条件" prop="preconditions">
          <el-input
            v-model="preconditionsText"
            type="textarea"
            :rows="3"
            placeholder="每行一个前置条件"
          />
        </el-form-item>
        <el-form-item label="测试步骤" prop="steps">
          <el-input
            v-model="stepsText"
            type="textarea"
            :rows="5"
            placeholder="每行一个测试步骤"
          />
        </el-form-item>
        <el-form-item label="预期结果" prop="expectedResults">
          <el-input
            v-model="expectedResultsText"
            type="textarea"
            :rows="5"
            placeholder="每行一个预期结果"
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
  getAllTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
} from '@/api'

const loading = ref(false)
const testCases = ref<any[]>([])
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<any>(null)
const isEdit = ref(false)

const searchForm = ref({
  title: '',
  system: '',
  priority: '',
})

const pagination = ref({
  page: 1,
  size: 10,
  total: 0,
})

const formData = ref({
  id: '',
  title: '',
  system: '',
  module: '',
  priority: 'P1',
  testType: '功能测试',
  testObjective: '',
  entryUrl: '',
  preconditions: [] as string[],
  steps: [] as string[],
  expectedResults: [] as string[],
})

const preconditionsText = ref('')
const stepsText = ref('')
const expectedResultsText = ref('')

const formRules = {
  title: [{ required: true, message: '请输入测试名称', trigger: 'blur' }],
  module: [{ required: true, message: '请输入功能模块', trigger: 'blur' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
  testType: [{ required: true, message: '请输入测试类型', trigger: 'blur' }],
}

const dialogTitle = computed(() => (isEdit.value ? '编辑用例' : '新增用例'))

const getPriorityType = (priority: string) => {
  const map: Record<string, string> = {
    P0: 'danger',
    P1: 'warning',
    P2: 'info',
  }
  return map[priority] || 'info'
}

const loadTestCases = async () => {
  loading.value = true
  try {
    const response = await getAllTestCases()
    if (response.success) {
      let data = response.data || []
      
      // 前端过滤
      if (searchForm.value.title) {
        data = data.filter((item: any) =>
          item.title.includes(searchForm.value.title)
        )
      }
      if (searchForm.value.system) {
        data = data.filter((item: any) =>
          item.system === searchForm.value.system
        )
      }
      if (searchForm.value.priority) {
        data = data.filter((item: any) => item.priority === searchForm.value.priority)
      }

      pagination.value.total = data.length
      const start = (pagination.value.page - 1) * pagination.value.size
      const end = start + pagination.value.size
      testCases.value = data.slice(start, end)
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetSearch = () => {
  searchForm.value = {
    title: '',
    system: '',
    priority: '',
  }
  loadTestCases()
}

const handleAdd = () => {
  isEdit.value = false
  formData.value = {
    id: '',
    title: '',
    system: '',
    module: '',
    priority: 'P1',
    testType: '功能测试',
    testObjective: '',
    entryUrl: '',
    preconditions: [],
    steps: [],
    expectedResults: [],
  }
  preconditionsText.value = ''
  stepsText.value = ''
  expectedResultsText.value = ''
  dialogVisible.value = true
}

const handleEdit = (row: any) => {
  isEdit.value = true
  formData.value = { ...row }
  preconditionsText.value = (row.preconditions || []).join('\n')
  stepsText.value = (row.steps || []).join('\n')
  expectedResultsText.value = (row.expectedResults || []).join('\n')
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    submitting.value = true
    try {
      // 转换文本为数组
      formData.value.preconditions = preconditionsText.value
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s)
      formData.value.steps = stepsText.value
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s)
      formData.value.expectedResults = expectedResultsText.value
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s)

      // 新增时不需要传ID，后端会自动生成
      const submitData = { ...formData.value }
      if (!isEdit.value) {
        delete submitData.id
      }

      if (isEdit.value) {
        await updateTestCase(formData.value.id, submitData)
        ElMessage.success('更新成功')
      } else {
        await createTestCase(submitData)
        ElMessage.success('创建成功')
      }

      dialogVisible.value = false
      loadTestCases()
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败')
    } finally {
      submitting.value = false
    }
  })
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要删除该测试用例吗？', '提示', {
      type: 'warning',
    })
    await deleteTestCase(row.id)
    ElMessage.success('删除成功')
    loadTestCases()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

onMounted(() => {
  loadTestCases()
})
</script>

<style scoped>
.test-cases-page {
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

.search-form {
  margin-bottom: 20px;
}
</style>

