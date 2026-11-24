import { createRouter, createWebHashHistory } from 'vue-router'
import { state } from './store'

const routes = [
  {
    path: '/welcome',
    name: 'welcome',
    component: () => import('./views/OnboardingView.vue'),
    meta: { hideTabs: true, public: true },
  },
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/add', name: 'add', component: () => import('./views/CaptureView.vue') },
  { path: '/book', name: 'book', component: () => import('./views/ChaptersView.vue') },
  {
    path: '/book/:id',
    name: 'reader',
    component: () => import('./views/ReaderView.vue'),
    meta: { hideTabs: true },
  },
  { path: '/people', name: 'people', component: () => import('./views/PeopleView.vue') },
  { path: '/people/:id', name: 'person', component: () => import('./views/PersonView.vue') },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  // 정적 호스팅(Vercel·Cloudflare Pages)에서 리라이트 설정 없이 동작하도록 해시 히스토리 사용
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  if (!state.onboarded && to.name !== 'welcome') {
    return { name: 'welcome' }
  }
  if (state.onboarded && to.name === 'welcome') {
    return { name: 'home' }
  }
  return true
})
