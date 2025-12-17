import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue')
  },
  {
    path: '/test-cases',
    name: 'TestCases',
    component: () => import('@/views/TestCases.vue')
  },
  {
    path: '/test-suites',
    name: 'TestSuites',
    component: () => import('@/views/TestSuites.vue')
  },
  {
    path: '/executions/:executionId',
    name: 'ExecutionDetail',
    component: () => import('@/views/ExecutionDetail.vue')
  },
  {
    path: '/executions/:executionId/report',
    name: 'SuiteReport',
    component: () => import('@/views/SuiteReport.vue')
  },
  {
    path: '/run',
    name: 'Run',
    component: () => import('@/views/Run.vue')
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('@/views/Reports.vue')
  },
  {
    path: '/prds',
    name: 'PRDs',
    component: () => import('@/views/PRDs.vue')
  },
  {
    path: '/prd-generation',
    name: 'PRDGeneration',
    component: () => import('@/views/PRDGeneration.vue')
  },
  {
    path: '/prd-edit/:taskId',
    name: 'PRDEdit',
    component: () => import('@/views/PRDEdit.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

