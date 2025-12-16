<template>
  <el-menu
    :default-active="activeIndex"
    class="nav-menu"
    mode="horizontal"
    router
    :ellipsis="false"
  >
    <el-menu-item index="/">
      <el-icon><HomeFilled /></el-icon>
      <span>首页</span>
    </el-menu-item>
    <el-menu-item index="/test-cases">
      <el-icon><DocumentCopy /></el-icon>
      <span>测试用例</span>
    </el-menu-item>
    <el-menu-item index="/test-suites">
      <el-icon><Folder /></el-icon>
      <span>用例集</span>
    </el-menu-item>
    <el-menu-item index="/reports">
      <el-icon><Document /></el-icon>
      <span>测试报告</span>
    </el-menu-item>
    <el-menu-item index="/run">
      <el-icon><VideoPlay /></el-icon>
      <span>测试执行</span>
    </el-menu-item>
    <el-menu-item index="/prds">
      <el-icon><DocumentChecked /></el-icon>
      <span>PRD管理</span>
    </el-menu-item>
  </el-menu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { HomeFilled, DocumentCopy, VideoPlay, Document, Folder, DocumentChecked } from '@element-plus/icons-vue'

const route = useRoute()
const activeIndex = computed(() => {
  // 如果路径是 /executions/:id，返回 /test-suites
  if (route.path.startsWith('/executions/')) {
    return '/test-suites'
  }
  return route.path
})
</script>

<style scoped>
.nav-menu {
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 20px;
}
</style>

