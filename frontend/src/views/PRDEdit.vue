<template>
  <div class="prd-edit-page">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <span>PRD 编辑</span>
          <div>
            <el-button size="small" @click="handleRefresh">刷新</el-button>
            <el-button size="small" @click="handleExportMarkdown">导出Markdown</el-button>
            <el-button size="small" type="primary" @click="handleSave" :loading="saving">保存</el-button>
          </div>
        </div>
      </template>

      <div class="edit-container">
        <!-- 左侧：编辑区 -->
        <div class="edit-panel">
          <el-tabs v-model="activeTab" type="border-card">
            <el-tab-pane label="编辑" name="edit">
              <el-input
                v-model="prdContent"
                type="textarea"
                :rows="30"
                placeholder="PRD内容..."
                class="prd-editor"
              />
            </el-tab-pane>
            <el-tab-pane label="预览" name="preview">
              <el-scrollbar height="600px">
                <div class="prd-preview markdown-content" v-html="renderedPRD"></div>
              </el-scrollbar>
            </el-tab-pane>
          </el-tabs>

          <!-- 段落级操作 -->
          <div class="paragraph-actions" v-if="selectedSection">
            <el-card shadow="never" class="section-card">
              <template #header>
                <span>段落操作: {{ selectedSection }}</span>
              </template>
              <el-input
                v-model="sectionContext"
                type="textarea"
                :rows="3"
                placeholder="上下文信息（可选）"
              />
              <div class="action-buttons">
                <el-button type="primary" @click="handleRegenerateParagraph" :loading="regenerating">
                  重新生成此段落
                </el-button>
                <el-button @click="selectedSection = null">取消</el-button>
              </div>
            </el-card>
          </div>
        </div>

        <!-- 右侧：操作面板 -->
        <div class="action-panel">
          <el-card shadow="never">
            <template #header>
              <span>操作</span>
            </template>

            <div class="action-list">
              <el-button type="primary" block @click="handleSelectSection('产品概述')">
                重新生成：产品概述
              </el-button>
              <el-button type="primary" block @click="handleSelectSection('功能需求')">
                重新生成：功能需求
              </el-button>
              <el-button type="primary" block @click="handleSelectSection('非功能需求')">
                重新生成：非功能需求
              </el-button>
              <el-button type="primary" block @click="handleSelectSection('用户场景')">
                重新生成：用户场景
              </el-button>
              <el-button type="primary" block @click="handleSelectSection('技术约束')">
                重新生成：技术约束
              </el-button>
              <el-button type="primary" block @click="handleSelectSection('风险评估')">
                重新生成：风险评估
              </el-button>
            </div>

            <el-divider />

            <div class="info-section">
              <h4>任务信息</h4>
              <p><strong>任务ID:</strong> {{ taskId }}</p>
              <p v-if="taskStatus">
                <strong>状态:</strong>
                <el-tag :type="getStatusType(taskStatus.status)" size="small">
                  {{ getStatusLabel(taskStatus.status) }}
                </el-tag>
              </p>
            </div>
          </el-card>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getGenerationResult,
  getGenerationStatus,
  regenerateParagraph,
  getSchema,
  saveGeneratedPRD,
  exportPRDAsMarkdown
} from '@/api/index'
import { renderMarkdown } from '@/utils/markdown'

const route = useRoute()
const router = useRouter()

const taskId = ref<string>(route.params.taskId as string)
const loading = ref(false)
const saving = ref(false)
const prdContent = ref<string>('')
const activeTab = ref('edit')
const selectedSection = ref<string | null>(null)
const sectionContext = ref<string>('')
const regenerating = ref(false)
const taskStatus = ref<any>(null)

const renderedPRD = computed(() => {
  if (!prdContent.value) return ''
  return renderMarkdown(prdContent.value)
})

const handleRefresh = async () => {
  await loadPRD()
  await loadStatus()
}

const handleExportMarkdown = async () => {
  if (!taskId.value) {
    ElMessage.warning('任务ID不存在')
    return
  }

  if (!prdContent.value || prdContent.value.trim() === '') {
    ElMessage.warning('PRD内容为空，无法导出')
    return
  }

  try {
    await exportPRDAsMarkdown(taskId.value)
    ElMessage.success('导出成功')
  } catch (error: any) {
    ElMessage.error(error.message || '导出失败')
  }
}

const handleSave = async () => {
  if (!taskId.value) {
    ElMessage.warning('任务ID不存在')
    return
  }

  if (!prdContent.value || prdContent.value.trim() === '') {
    ElMessage.warning('PRD内容为空，无法保存')
    return
  }

  saving.value = true
  try {
    // 获取任务信息作为默认标题
    const taskTitle = taskStatus.value?.title || '编辑的PRD'
    
    // 保存PRD，传递编辑后的内容
    const result = await saveGeneratedPRD(taskId.value, {
      title: taskTitle,
      status: 'draft',
      prdContent: prdContent.value // 传递编辑后的内容
    })

    if (result.success) {
      ElMessage.success(`PRD保存成功！PRD ID: ${result.data.prdId}`)
      // 刷新状态
      await loadStatus()
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '保存PRD失败')
  } finally {
    saving.value = false
  }
}

const handleSelectSection = (section: string) => {
  selectedSection.value = section
  sectionContext.value = ''
}

const handleRegenerateParagraph = async () => {
  if (!selectedSection.value) return

  regenerating.value = true
  try {
    // 获取Schema
    const schemaResult = await getSchema(taskId.value)
    if (!schemaResult.success || !schemaResult.data) {
      ElMessage.error('无法获取Schema')
      return
    }

    // 调用重生成API
    const result = await regenerateParagraph(taskId.value, {
      sectionTitle: selectedSection.value,
      context: sectionContext.value || undefined
    })

    if (result.success) {
      // 替换对应章节的内容
      const newContent = result.data.content
      replaceSectionContent(selectedSection.value, newContent)
      ElMessage.success('段落已重新生成')
      selectedSection.value = null
      sectionContext.value = ''
    }
  } catch (error: any) {
    ElMessage.error(error.message || '重新生成失败')
  } finally {
    regenerating.value = false
  }
}

const replaceSectionContent = (sectionTitle: string, newContent: string) => {
  // 简单的替换逻辑：找到对应章节并替换
  const lines = prdContent.value.split('\n')
  const sectionIndex = lines.findIndex(line => 
    line.trim().startsWith('##') && line.includes(sectionTitle)
  )

  if (sectionIndex === -1) {
    // 如果找不到章节，直接追加
    prdContent.value += `\n\n## ${sectionTitle}\n\n${newContent}\n`
    return
  }

  // 找到下一个章节的开始位置
  let nextSectionIndex = lines.length
  for (let i = sectionIndex + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith('##')) {
      nextSectionIndex = i
      break
    }
  }

  // 替换章节内容
  const before = lines.slice(0, sectionIndex + 1).join('\n')
  const after = lines.slice(nextSectionIndex).join('\n')
  prdContent.value = `${before}\n${newContent}\n${after}`
}

const loadPRD = async () => {
  if (!taskId.value) return

  loading.value = true
  try {
    const result = await getGenerationResult(taskId.value)
    if (result.success && result.data) {
      prdContent.value = result.data.prdContent
    } else {
      ElMessage.warning('PRD内容不存在')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载PRD失败')
  } finally {
    loading.value = false
  }
}

const loadStatus = async () => {
  if (!taskId.value) return

  try {
    const result = await getGenerationStatus(taskId.value)
    if (result.success) {
      taskStatus.value = result.data
    }
  } catch (error: any) {
    console.error('Load status error:', error)
  }
}

const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    pending: 'info',
    running: 'warning',
    completed: 'success',
    failed: 'danger'
  }
  return map[status] || 'info'
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '进行中',
    completed: '已完成',
    failed: '失败'
  }
  return map[status] || status
}

onMounted(() => {
  loadPRD()
  loadStatus()
})
</script>

<style scoped>
.prd-edit-page {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.edit-container {
  display: flex;
  gap: 20px;
}

.edit-panel {
  flex: 1;
}

.action-panel {
  width: 300px;
}

.prd-editor {
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.prd-preview {
  padding: 20px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
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

.paragraph-actions {
  margin-top: 20px;
}

.section-card {
  margin-top: 10px;
}

.action-buttons {
  margin-top: 15px;
  display: flex;
  gap: 10px;
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-section {
  margin-top: 20px;
}

.info-section h4 {
  margin-bottom: 10px;
}

.info-section p {
  margin-bottom: 8px;
  font-size: 14px;
}
</style>

