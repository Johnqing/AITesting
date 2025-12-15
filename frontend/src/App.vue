<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-content">
        <h1 class="title">
          <el-icon><Document /></el-icon>
          TestFlow
        </h1>
        <span class="subtitle">AI驱动的自动化测试平台</span>
      </div>
    </el-header>
    <el-main class="app-main">
      <NavMenu />
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { Document } from '@element-plus/icons-vue'
import NavMenu from './components/NavMenu.vue'
</script>

<style scoped>
.app-container {
  height: 100vh;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.subtitle {
  font-size: 14px;
  opacity: 0.9;
}

.app-main {
  background-color: #f5f7fa;
  padding: 24px;
}
</style>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
</style>

