<template>
    <div class="home">
        <el-card class="welcome-card">
            <template #header>
                <div class="card-header">
                    <span>欢迎使用 TestFlow</span>
                </div>
            </template>
            <div class="welcome-content">
                <el-icon class="welcome-icon" :size="80">
                    <Document />
                </el-icon>
                <h2>AI驱动的自动化测试平台</h2>
                <p>TestFlow 是一个基于 AI 和 Playwright 的自动化测试系统，支持自然语言编写测试用例。</p>
            </div>
        </el-card>

        <el-row :gutter="20" class="feature-cards">
            <el-col :xs="24" :sm="12" :md="6">
                <el-card class="feature-card" shadow="hover" @click="$router.push('/test-cases')">
                    <el-icon :size="40" color="#409EFF">
                        <DocumentCopy />
                    </el-icon>
                    <h3>测试用例</h3>
                    <p>管理测试用例，支持增删改查</p>
                </el-card>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <el-card class="feature-card" shadow="hover" @click="$router.push('/test-suites')">
                    <el-icon :size="40" color="#67C23A">
                        <Folder />
                    </el-icon>
                    <h3>用例集</h3>
                    <p>管理用例集，支持批量执行</p>
                </el-card>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <el-card class="feature-card" shadow="hover" @click="$router.push('/reports')">
                    <el-icon :size="40" color="#E6A23C">
                        <Document />
                    </el-icon>
                    <h3>测试报告</h3>
                    <p>查看和管理测试执行报告</p>
                </el-card>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <el-card class="feature-card" shadow="hover" @click="$router.push('/prd-generation')">
                    <el-icon :size="40" color="#9C27B0">
                        <MagicStick />
                    </el-icon>
                    <h3>需求说明自动生成</h3>
                    <p>AI自动生成产品需求文档</p>
                </el-card>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
                <el-card class="feature-card" shadow="hover" @click="$router.push('/prds')">
                    <el-icon :size="40" color="#F56C6C">
                        <DocumentChecked />
                    </el-icon>
                    <h3>需求说明管理</h3>
                    <p>从需求说明自动生成测试用例</p>
                </el-card>
            </el-col>
        </el-row>

        <el-card class="status-card" v-if="apiInfo">
            <template #header>
                <span>系统状态</span>
            </template>
            <el-descriptions :column="2" border>
                <el-descriptions-item label="API 名称">{{ apiInfo.name }}</el-descriptions-item>
                <el-descriptions-item label="API 版本">{{ apiInfo.version }}</el-descriptions-item>
                <el-descriptions-item label="描述" :span="2">{{ apiInfo.description }}</el-descriptions-item>
            </el-descriptions>
        </el-card>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Document, DocumentCopy, Folder, DocumentChecked, MagicStick } from '@element-plus/icons-vue'
import { getApiInfo } from '@/api'

const apiInfo = ref<any>(null)

onMounted(async () => {
    try {
        const data = await getApiInfo()
        apiInfo.value = data
    } catch (error) {
        console.error('获取 API 信息失败:', error)
    }
})
</script>

<style scoped>
.home {
    max-width: 1200px;
    margin: 0 auto;
}

.welcome-card {
    margin-bottom: 24px;
}

.card-header {
    font-size: 18px;
    font-weight: 600;
}

.welcome-content {
    text-align: center;
    padding: 40px 20px;
}

.welcome-icon {
    margin-bottom: 20px;
    color: #667eea;
}

.welcome-content h2 {
    margin: 20px 0;
    color: #303133;
}

.welcome-content p {
    color: #606266;
    line-height: 1.8;
    max-width: 600px;
    margin: 0 auto;
}

.feature-cards {
    margin-bottom: 24px;
}

.feature-card {
    text-align: center;
    cursor: pointer;
    transition: transform 0.3s;
    height: 200px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.feature-card:hover {
    transform: translateY(-5px);
}

.feature-card h3 {
    margin: 16px 0 8px;
    color: #303133;
}

.feature-card p {
    color: #909399;
    font-size: 14px;
}

.status-card {
    margin-top: 24px;
}
</style>
