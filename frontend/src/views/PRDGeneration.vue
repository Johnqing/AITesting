<template>
  <div class="prd-generation-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>PRD 自动生成</span>
          <el-button type="primary" @click="handleNewGeneration" v-if="!currentTaskId">
            <el-icon><Plus /></el-icon>
            新建生成任务
          </el-button>
        </div>
      </template>

      <!-- 需求输入阶段 -->
      <div v-if="!currentTaskId" class="input-section">
        <el-form :model="requirementForm" label-width="120px">
          <el-form-item label="任务标题（可选）">
            <el-input v-model="requirementForm.title" placeholder="请输入任务标题" />
          </el-form-item>
          <el-form-item label="产品需求">
            <el-input
              v-model="requirementForm.requirement"
              type="textarea"
              :rows="10"
              placeholder="请描述您的产品需求，例如：&#10;&#10;我想开发一个在线学习平台，主要功能包括：&#10;1. 用户注册和登录&#10;2. 课程浏览和搜索&#10;3. 课程购买和支付&#10;4. 视频播放和学习进度跟踪&#10;5. 学习社区和讨论&#10;&#10;目标用户是学生和职场人士..."
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleStartGeneration" :loading="starting">
              开始生成
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 对话和生成阶段 -->
      <div v-else class="generation-section">
        <!-- 任务状态 -->
        <el-card shadow="never" class="status-card">
          <el-steps :active="stepIndex" finish-status="success" align-center>
            <el-step title="需求澄清" :description="statusTexts.clarification" />
            <el-step title="Schema结构化" :description="statusTexts.schema" />
            <el-step title="PRD生成" :description="statusTexts.generation" />
          </el-steps>
          
          <div class="status-info" v-if="taskStatus">
            <el-tag :type="getStatusType(taskStatus.status)">
              {{ getStatusLabel(taskStatus.status) }}
            </el-tag>
            <span class="progress-text">进度: {{ taskStatus.progress }}%</span>
            <el-button size="small" @click="handleRefreshStatus" :loading="refreshing">
              刷新状态
            </el-button>
          </div>
        </el-card>

        <!-- 对话区域 -->
        <el-card shadow="never" class="chat-card" v-if="taskStatus?.currentStep === 'clarification'">
          <template #header>
            <span>需求澄清对话</span>
          </template>
          
          <div class="chat-messages" ref="chatMessagesRef">
            <div
              v-for="(msg, index) in messages"
              :key="index"
              :class="['message', msg.role]"
            >
              <div class="message-avatar">
                <el-icon v-if="msg.role === 'user'"><User /></el-icon>
                <el-icon v-else><ChatDotRound /></el-icon>
              </div>
              <div class="message-content">
                <div class="message-text">{{ msg.content }}</div>
                <div class="message-time">{{ formatTime(msg.createdAt) }}</div>
              </div>
            </div>
          </div>

          <div class="chat-input" v-if="taskStatus?.status === 'running' && taskStatus?.currentStep === 'clarification'">
            <el-input
              v-model="userResponse"
              type="textarea"
              :rows="3"
              placeholder="请回答上述问题..."
            />
            <div class="chat-actions">
              <el-button type="primary" @click="handleSendResponse" :loading="sending">
                发送
              </el-button>
            </div>
          </div>
        </el-card>

        <!-- PRD预览区域 -->
        <el-card shadow="never" class="result-card" v-if="prdContent">
          <template #header>
            <div class="result-header">
              <span>生成的 PRD</span>
              <div>
                <el-button size="small" @click="handleExportMarkdown">导出Markdown</el-button>
                <el-button size="small" @click="handleEditPRD">编辑</el-button>
                <el-button size="small" type="primary" @click="handleSavePRD">保存</el-button>
              </div>
            </div>
          </template>
          
          <el-scrollbar height="600px">
            <div class="prd-preview">
              <div v-html="renderedPRD" class="markdown-content"></div>
            </div>
          </el-scrollbar>
        </el-card>

        <!-- 加载中 -->
        <el-card shadow="never" v-if="taskStatus?.status === 'running' && !prdContent">
          <el-result icon="loading" title="正在生成PRD，请稍候...">
            <template #sub-title>
              <p>当前步骤: {{ getStepLabel(taskStatus.currentStep) }}</p>
              <p>进度: {{ taskStatus.progress }}%</p>
            </template>
          </el-result>
        </el-card>

        <!-- 错误信息 -->
        <el-alert
          v-if="taskStatus?.status === 'failed'"
          type="error"
          :title="taskStatus.errorMessage || '生成失败'"
          show-icon
          :closable="false"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, User, ChatDotRound } from '@element-plus/icons-vue'
import {
  startPRDGeneration,
  getGenerationStatus,
  continueConversation,
  getMessages,
  getGenerationResult,
  saveGeneratedPRD,
  exportPRDAsMarkdown
} from '@/api/index'
import { renderMarkdown } from '@/utils/markdown'

const requirementForm = ref({
  title: '',
  requirement: ''
})

const currentTaskId = ref<string>('')
const taskStatus = ref<any>(null)
const messages = ref<any[]>([])
const prdContent = ref<string>('')
const userResponse = ref<string>('')

const starting = ref(false)
const sending = ref(false)
const refreshing = ref(false)

let statusPollingTimer: number | null = null
let eventSource: EventSource | null = null

const stepIndex = computed(() => {
  if (!taskStatus.value?.currentStep) return 0
  const stepMap: Record<string, number> = {
    clarification: 0,
    schema: 1,
    generation: 2
  }
  return stepMap[taskStatus.value.currentStep] || 0
})

const statusTexts = computed(() => {
  const step = taskStatus.value?.currentStep
  return {
    clarification: step === 'clarification' ? '进行中...' : '已完成',
    schema: step === 'schema' ? '进行中...' : step === 'generation' ? '已完成' : '等待中',
    generation: step === 'generation' ? '进行中...' : step === 'completed' ? '已完成' : '等待中'
  }
})

const renderedPRD = computed(() => {
  if (!prdContent.value) return ''
  return renderMarkdown(prdContent.value)
})

const chatMessagesRef = ref<HTMLElement>()

const handleNewGeneration = () => {
  // 清理SSE连接和轮询
  stopSSE()
  if (statusPollingTimer) {
    clearInterval(statusPollingTimer)
    statusPollingTimer = null
  }
  
  currentTaskId.value = ''
  taskStatus.value = null
  messages.value = []
  prdContent.value = ''
  userResponse.value = ''
  requirementForm.value = { title: '', requirement: '' }
}

const handleStartGeneration = async () => {
  if (!requirementForm.value.requirement.trim()) {
    ElMessage.warning('请输入产品需求')
    return
  }

  starting.value = true
  try {
    const result = await startPRDGeneration({
      requirement: requirementForm.value.requirement,
      title: requirementForm.value.title || undefined
    })
    
    if (result.success) {
      currentTaskId.value = result.data.taskId
      ElMessage.success('生成任务已启动')
      await loadStatus()
      await loadMessages()
      // 使用SSE替代轮询
      startSSE()
    }
  } catch (error: any) {
    ElMessage.error(error.message || '启动生成失败')
  } finally {
    starting.value = false
  }
}

const handleSendResponse = async () => {
  if (!userResponse.value.trim()) {
    ElMessage.warning('请输入回答')
    return
  }

  sending.value = true
  try {
    const result = await continueConversation(currentTaskId.value, userResponse.value)
    
    if (result.success) {
      userResponse.value = ''
      await loadMessages()
      await loadStatus()
      
      if (result.data.isComplete) {
        ElMessage.success('需求已完整，开始生成PRD')
        // 如果SSE未连接，启动SSE
        if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
          startSSE()
        }
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '发送失败')
  } finally {
    sending.value = false
  }
}

const handleRefreshStatus = async () => {
  await loadStatus()
  if (taskStatus.value?.status === 'completed' && !prdContent.value) {
    await loadResult()
  }
}

const handleEditPRD = () => {
  // 跳转到编辑页面
  if (currentTaskId.value) {
    window.open(`/prd-edit/${currentTaskId.value}`, '_blank')
  }
}

const handleExportMarkdown = async () => {
  if (!currentTaskId.value) {
    ElMessage.warning('没有可导出的PRD')
    return
  }

  if (!prdContent.value) {
    ElMessage.warning('PRD内容为空，无法导出')
    return
  }

  try {
    await exportPRDAsMarkdown(currentTaskId.value)
    ElMessage.success('导出成功')
  } catch (error: any) {
    ElMessage.error(error.message || '导出失败')
  }
}

const handleSavePRD = async () => {
  if (!currentTaskId.value) {
    ElMessage.warning('没有可保存的PRD')
    return
  }

  if (!prdContent.value) {
    ElMessage.warning('PRD内容为空，无法保存')
    return
  }

  try {
    // 获取任务信息作为默认标题
    const taskTitle = taskStatus.value?.title || requirementForm.value.title || '生成的PRD'
    
    const result = await saveGeneratedPRD(currentTaskId.value, {
      title: taskTitle,
      status: 'draft'
    })

    if (result.success) {
      ElMessage.success(`PRD保存成功！PRD ID: ${result.data.prdId}`)
      // 可以跳转到PRD列表页面
      // router.push('/prds')
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '保存PRD失败')
  }
}

const loadStatus = async () => {
  if (!currentTaskId.value) return
  
  try {
    const result = await getGenerationStatus(currentTaskId.value)
    if (result.success) {
      taskStatus.value = result.data
    }
  } catch (error: any) {
    console.error('Load status error:', error)
  }
}

const loadMessages = async () => {
  if (!currentTaskId.value) return
  
  try {
    const result = await getMessages(currentTaskId.value)
    if (result.success) {
      messages.value = result.data
      await nextTick()
      scrollToBottom()
    }
  } catch (error: any) {
    console.error('Load messages error:', error)
  }
}

const loadResult = async () => {
  if (!currentTaskId.value) return
  
  try {
    const result = await getGenerationResult(currentTaskId.value)
    if (result.success && result.data) {
      prdContent.value = result.data.prdContent
      if (statusPollingTimer) {
        clearInterval(statusPollingTimer)
        statusPollingTimer = null
      }
    }
  } catch (error: any) {
    console.error('Load result error:', error)
  }
}

// 启动SSE连接
const startSSE = () => {
  if (!currentTaskId.value) return
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }

  // 构建SSE URL
  const streamUrl = `/api/v1/prd/generate/${currentTaskId.value}/stream`
  eventSource = new EventSource(streamUrl)

  // 连接成功
  eventSource.addEventListener('connected', (e) => {
    console.log('SSE connected:', JSON.parse(e.data))
  })

  // 接收状态更新
  eventSource.addEventListener('status', (e) => {
    const statusData = JSON.parse(e.data)
    taskStatus.value = {
      ...taskStatus.value,
      ...statusData
    }
    console.log('Status updated:', statusData)
  })

  // 接收初始消息列表
  eventSource.addEventListener('messages', (e) => {
    const data = JSON.parse(e.data)
    if (data.messages && Array.isArray(data.messages)) {
      messages.value = data.messages
      nextTick(() => {
        scrollToBottom()
      })
    }
  })

  // 接收新消息
  eventSource.addEventListener('message', (e) => {
    const messageData = JSON.parse(e.data)
    // 检查消息是否已存在
    const exists = messages.value.some(m => m.id === messageData.id)
    if (!exists) {
      messages.value.push(messageData)
      nextTick(() => {
        scrollToBottom()
      })
    }
  })

  // 任务完成
  eventSource.addEventListener('completed', async (e) => {
    const data = JSON.parse(e.data)
    console.log('Task completed:', data.status)
    
    if (data.status === 'completed') {
      await loadResult()
    }
    
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  })

  // 错误处理
  eventSource.addEventListener('error', (e) => {
    const errorData = JSON.parse(e.data)
    console.error('SSE error:', errorData)
    ElMessage.error(errorData.error || '连接错误')
  })

  // EventSource错误
  eventSource.onerror = (error) => {
    console.error('EventSource error:', error)
    // 如果连接关闭，尝试重新连接
    if (eventSource?.readyState === EventSource.CLOSED) {
      console.log('SSE connection closed, attempting to reconnect...')
      setTimeout(() => {
        if (currentTaskId.value && taskStatus.value?.status !== 'completed' && taskStatus.value?.status !== 'failed') {
          startSSE()
        }
      }, 3000)
    }
  }
}

// 停止SSE连接
const stopSSE = () => {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

// 保留轮询作为后备方案
const startPolling = () => {
  if (statusPollingTimer) return
  
  statusPollingTimer = window.setInterval(async () => {
    await loadStatus()
    
    if (taskStatus.value?.status === 'completed') {
      await loadResult()
      if (statusPollingTimer) {
        clearInterval(statusPollingTimer)
        statusPollingTimer = null
      }
    } else if (taskStatus.value?.status === 'failed') {
      if (statusPollingTimer) {
        clearInterval(statusPollingTimer)
        statusPollingTimer = null
      }
    }
  }, 2000) // 每2秒轮询一次
}

const scrollToBottom = () => {
  if (chatMessagesRef.value) {
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
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

const getStepLabel = (step?: string) => {
  const map: Record<string, string> = {
    clarification: '需求澄清',
    schema: 'Schema结构化',
    generation: 'PRD生成'
  }
  return step ? map[step] || step : '未知'
}

const formatTime = (time: string | Date) => {
  const date = typeof time === 'string' ? new Date(time) : time
  return date.toLocaleString('zh-CN')
}

onMounted(async () => {
  // 如果URL中有taskId，加载该任务
  const params = new URLSearchParams(window.location.search)
  const taskId = params.get('taskId')
  if (taskId) {
    currentTaskId.value = taskId
    await loadStatus()
    await loadMessages()
    await loadResult()
    // 如果任务还在运行，启动SSE连接
    if (taskStatus.value?.status === 'running') {
      startSSE()
    }
  }
})

onUnmounted(() => {
  // 清理SSE连接
  stopSSE()
  // 清理轮询定时器
  if (statusPollingTimer) {
    clearInterval(statusPollingTimer)
    statusPollingTimer = null
  }
})
</script>

<style scoped>
.prd-generation-page {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-section {
  max-width: 800px;
  margin: 0 auto;
}

.generation-section {
  max-width: 1200px;
  margin: 0 auto;
}

.status-card {
  margin-bottom: 20px;
}

.status-info {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
}

.progress-text {
  font-size: 14px;
  color: #666;
}

.chat-card {
  margin-bottom: 20px;
}

.chat-messages {
  max-height: 400px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  margin-bottom: 15px;
}

.message {
  display: flex;
  margin-bottom: 15px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 10px;
}

.message.user .message-avatar {
  background: #409eff;
  color: white;
}

.message-content {
  flex: 1;
  max-width: 70%;
}

.message.user .message-content {
  text-align: right;
}

.message-text {
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .message-text {
  background: #409eff;
  color: white;
}

.message-time {
  font-size: 12px;
  color: #999;
  margin-top: 5px;
}

.chat-input {
  margin-top: 15px;
}

.chat-actions {
  margin-top: 10px;
  text-align: right;
}

.result-card {
  margin-top: 20px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
</style>

