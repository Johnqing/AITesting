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
    <el-menu-item index="/parse">
      <el-icon><DocumentCopy /></el-icon>
      <span>用例解析</span>
    </el-menu-item>
    <el-menu-item index="/run">
      <el-icon><VideoPlay /></el-icon>
      <span>测试执行</span>
    </el-menu-item>
    <el-menu-item index="/reports">
      <el-icon><Document /></el-icon>
      <span>测试报告</span>
    </el-menu-item>
  </el-menu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { HomeFilled, DocumentCopy, VideoPlay, Document } from '@element-plus/icons-vue'

const route = useRoute()
const activeIndex = computed(() => route.path)
</script>

<style scoped>
.nav-menu {
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 20px;
}
</style>

