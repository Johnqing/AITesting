<template>
  <el-menu
    :default-active="activeIndex"
    class="nav-menu"
    mode="vertical"
    router
    :ellipsis="false"
  >
    <el-menu-item index="/">
      <el-icon><HomeFilled /></el-icon>
      <span>首页</span>
    </el-menu-item>
    
    <el-sub-menu index="test">
      <template #title>
        <el-icon><FolderOpened /></el-icon>
        <span>测试</span>
      </template>
      <el-menu-item index="/test-cases">
        <el-icon><DocumentCopy /></el-icon>
        <span>测试用例</span>
      </el-menu-item>
      <el-menu-item index="/test-suites">
        <el-icon><Folder /></el-icon>
        <span>用例集</span>
      </el-menu-item>
      <el-menu-item index="/run">
        <el-icon><VideoPlay /></el-icon>
        <span>执行测试</span>
      </el-menu-item>
      <el-menu-item index="/reports">
        <el-icon><Document /></el-icon>
        <span>测试报告</span>
      </el-menu-item>
    </el-sub-menu>

    <el-sub-menu index="requirement-management">
      <template #title>
        <el-icon><DocumentChecked /></el-icon>
        <span>需求管理</span>
      </template>
      <el-menu-item index="/prd-generation">
        <el-icon><MagicStick /></el-icon>
        <span>PRD自动生成</span>
      </el-menu-item>
      <el-menu-item index="/prds">
        <el-icon><DocumentChecked /></el-icon>
        <span>PRD管理</span>
      </el-menu-item>
    </el-sub-menu>
  </el-menu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { 
  HomeFilled, 
  DocumentCopy, 
  VideoPlay, 
  Document, 
  Folder, 
  DocumentChecked,
  FolderOpened,
  MagicStick
} from '@element-plus/icons-vue'

const route = useRoute()
const activeIndex = computed(() => {
  // 如果路径是 /executions/:id 或 /executions/:id/report，返回对应的父菜单项
  if (route.path.startsWith('/executions/')) {
    if (route.path.includes('/report')) {
      return '/reports'
    }
    return '/test-suites'
  }
  // 如果路径是 /prd-edit/:taskId，返回PRD自动生成页面
  if (route.path.startsWith('/prd-edit/')) {
    return '/prd-generation'
  }
  return route.path
})
</script>

<style scoped>
.nav-menu {
  border-right: none;
  height: 100%;
}
</style>

