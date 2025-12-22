<template>
    <div class="prd-generation-direct-page">
        <el-card>
            <template #header>
                <div class="card-header">
                    <span>需求说明 直接生成</span>
                    <el-tag type="info" size="small">快速模式：无需对话澄清，直接生成PRD</el-tag>
                </div>
            </template>

            <!-- 需求输入区域 -->
            <div v-if="!prdContent" class="input-section">
                <el-form :model="requirementForm" label-width="120px">
                    <el-form-item label="产品需求" required>
                        <el-input v-model="requirementForm.requirement" type="textarea" :rows="15"
                            placeholder="请描述您的产品需求，例如：&#10;&#10;我想开发一个在线学习平台，主要功能包括：&#10;1. 用户注册和登录&#10;2. 课程浏览和搜索&#10;3. 课程购买和支付&#10;4. 视频播放和学习进度跟踪&#10;5. 学习社区和讨论&#10;&#10;目标用户是学生和职场人士，希望平台支持移动端和Web端访问..." />
                        <div style="font-size: 12px; color: #909399; margin-top: 5px">
                            提示：请尽可能详细地描述您的产品需求，包括目标用户、核心功能、业务规则等
                        </div>
                    </el-form-item>
                    <el-form-item>
                        <el-button type="primary" @click="handleGenerate" :loading="generating" size="large">
                            <el-icon v-if="!generating">
                                <Document />
                            </el-icon>
                            {{ generating ? '生成中...' : '开始生成PRD' }}
                        </el-button>
                        <el-button @click="handleReset" :disabled="generating">重置</el-button>
                    </el-form-item>
                </el-form>
            </div>

            <!-- 生成结果区域 -->
            <div v-else class="result-section">
                <!-- 操作栏 -->
                <div class="action-bar">
                    <el-button @click="handleBack">返回编辑</el-button>
                    <el-button @click="handleCopy">复制内容</el-button>
                    <el-button @click="handleDownload">下载Markdown</el-button>
                    <el-button type="primary" @click="handleSave">保存PRD</el-button>
                </div>

                <!-- PRD预览 -->
                <el-card shadow="never" class="result-card">
                    <template #header>
                        <div class="result-header">
                            <span>生成的PRD文档</span>
                            <el-tag type="success">生成完成</el-tag>
                        </div>
                    </template>

                    <el-scrollbar height="700px">
                        <div class="prd-preview">
                            <div v-html="renderedPRD" class="markdown-content"></div>
                        </div>
                    </el-scrollbar>
                </el-card>
            </div>

            <!-- 加载中 -->
            <el-card shadow="never" v-if="generating && !prdContent" class="loading-card">
                <el-result icon="loading" title="正在生成PRD文档，请稍候...">
                    <template #sub-title>
                        <p>AI正在分析您的需求并生成完整的产品需求文档</p>
                        <p style="color: #909399; font-size: 12px; margin-top: 10px">
                            这可能需要几十秒到几分钟的时间，请耐心等待...
                        </p>
                    </template>
                </el-result>
            </el-card>
        </el-card>

        <!-- 保存PRD对话框 -->
        <el-dialog v-model="saveDialogVisible" title="保存PRD" width="600px" :close-on-click-modal="false">
            <el-form :model="saveForm" label-width="100px" ref="saveFormRef">
                <el-form-item label="标题" required>
                    <el-input v-model="saveForm.title" placeholder="请输入PRD标题" />
                </el-form-item>
                <el-form-item label="描述">
                    <el-input v-model="saveForm.description" type="textarea" :rows="3" placeholder="请输入PRD描述（可选）" />
                </el-form-item>
                <el-form-item label="版本">
                    <el-input v-model="saveForm.version" placeholder="例如：1.0.0" />
                </el-form-item>
                <el-form-item label="状态">
                    <el-select v-model="saveForm.status" placeholder="请选择状态">
                        <el-option label="草稿" value="draft" />
                        <el-option label="待审核" value="pending" />
                        <el-option label="已审核" value="approved" />
                    </el-select>
                </el-form-item>
                <el-form-item label="作者">
                    <el-input v-model="saveForm.author" placeholder="请输入作者（可选）" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="saveDialogVisible = false">取消</el-button>
                <el-button type="primary" @click="handleConfirmSave" :loading="saving">保存</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document } from '@element-plus/icons-vue'
import { generatePRDDirect, saveDirectGeneratedPRD } from '@/api/index'
import { renderMarkdown } from '@/utils/markdown'

const requirementForm = ref({
    requirement: ''
})

const generating = ref(false)
const prdContent = ref('')
const saveDialogVisible = ref(false)
const saving = ref(false)
const saveFormRef = ref<any>(null)

const saveForm = ref({
    title: '',
    description: '',
    version: '1.0.0',
    status: 'draft',
    author: ''
})

// 渲染Markdown内容
const renderedPRD = computed(() => {
    if (!prdContent.value) return ''
    return renderMarkdown(prdContent.value)
})

// 生成PRD
const handleGenerate = async () => {
    if (!requirementForm.value.requirement.trim()) {
        ElMessage.warning('请输入产品需求')
        return
    }

    generating.value = true
    prdContent.value = ''

    try {
        const result = await generatePRDDirect({
            requirement: requirementForm.value.requirement.trim()
        })

        prdContent.value = result.data.prdContent
        ElMessage.success('PRD生成成功！')

        // 自动提取标题（从PRD内容的第一行标题）
        const titleMatch = prdContent.value.match(/^#\s+(.+)$/m)
        if (titleMatch) {
            saveForm.value.title = titleMatch[1].trim()
        }
    } catch (error: any) {
        ElMessage.error(error.message || '生成PRD失败')
    } finally {
        generating.value = false
    }
}

// 重置表单
const handleReset = () => {
    requirementForm.value.requirement = ''
    prdContent.value = ''
}

// 返回编辑
const handleBack = () => {
    prdContent.value = ''
}

// 复制内容
const handleCopy = async () => {
    try {
        await navigator.clipboard.writeText(prdContent.value)
        ElMessage.success('内容已复制到剪贴板')
    } catch (error) {
        ElMessage.error('复制失败，请手动复制')
    }
}

// 下载Markdown文件
const handleDownload = () => {
    const blob = new Blob([prdContent.value], { type: 'text/markdown;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${saveForm.value.title || 'PRD'}.md`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    ElMessage.success('文件下载成功')
}

// 打开保存对话框
const handleSave = () => {
    if (!saveForm.value.title.trim()) {
        ElMessage.warning('请输入PRD标题')
        return
    }
    saveDialogVisible.value = true
}

// 确认保存
const handleConfirmSave = async () => {
    if (!saveFormRef.value) return

    try {
        await saveFormRef.value.validate()
    } catch (error) {
        return
    }

    saving.value = true
    try {
        await saveDirectGeneratedPRD({
            title: saveForm.value.title,
            description: saveForm.value.description || undefined,
            prdContent: prdContent.value,
            version: saveForm.value.version,
            status: saveForm.value.status,
            author: saveForm.value.author || undefined
        })

        ElMessage.success('PRD已保存到生成记录表')
        saveDialogVisible.value = false

        // 询问是否继续编辑
        ElMessageBox.confirm('PRD已保存成功，是否继续编辑？', '保存成功', {
            confirmButtonText: '继续编辑',
            cancelButtonText: '关闭',
            type: 'success'
        }).catch(() => {
            // 用户选择关闭
        })
    } catch (error: any) {
        ElMessage.error(error.message || '保存PRD失败')
    } finally {
        saving.value = false
    }
}
</script>

<style scoped>
.prd-generation-direct-page {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
}

.card-header {
    font-size: 18px;
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.input-section {
    margin-top: 20px;
}

.result-section {
    margin-top: 20px;
}

.action-bar {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    padding: 15px;
    background: #f5f7fa;
    border-radius: 4px;
}

.result-card {
    margin-top: 20px;
}

.result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 16px;
    font-weight: 600;
}

.prd-preview {
    padding: 20px;
}

.markdown-content {
    line-height: 1.8;
    color: #303133;
}

.markdown-content :deep(h1) {
    font-size: 28px;
    font-weight: 600;
    margin: 20px 0 15px;
    padding-bottom: 10px;
    border-bottom: 2px solid #e4e7ed;
}

.markdown-content :deep(h2) {
    font-size: 24px;
    font-weight: 600;
    margin: 25px 0 15px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e4e7ed;
}

.markdown-content :deep(h3) {
    font-size: 20px;
    font-weight: 600;
    margin: 20px 0 12px;
}

.markdown-content :deep(h4) {
    font-size: 16px;
    font-weight: 600;
    margin: 15px 0 10px;
}

.markdown-content :deep(p) {
    margin: 10px 0;
    line-height: 1.8;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
    margin: 10px 0;
    padding-left: 30px;
}

.markdown-content :deep(li) {
    margin: 5px 0;
    line-height: 1.8;
}

.markdown-content :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 15px 0;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
    border: 1px solid #e4e7ed;
    padding: 10px;
    text-align: left;
}

.markdown-content :deep(th) {
    background-color: #f5f7fa;
    font-weight: 600;
}

.markdown-content :deep(code) {
    background-color: #f5f7fa;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
}

.markdown-content :deep(pre) {
    background-color: #f5f7fa;
    padding: 15px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 15px 0;
}

.markdown-content :deep(pre code) {
    background-color: transparent;
    padding: 0;
}

.markdown-content :deep(blockquote) {
    border-left: 4px solid #409eff;
    padding-left: 15px;
    margin: 15px 0;
    color: #606266;
    background-color: #f5f7fa;
    padding: 10px 15px;
}

.loading-card {
    margin-top: 20px;
}
</style>
