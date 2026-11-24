<script setup lang="ts">
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'

const route = useRoute()

const tabs = [
  { to: '/', label: '홈', icon: 'home' },
  { to: '/add', label: '장면 만들기', icon: 'camera', create: true },
  { to: '/book', label: '책', icon: 'book' },
  { to: '/people', label: '사람들', icon: 'users' },
]

const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))
</script>

<template>
  <nav class="tabbar" aria-label="주요 메뉴">
    <router-link
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="tab"
      :class="{ 'is-active': isActive(tab.to), 'tab--create': tab.create }"
    >
      <template v-if="tab.create">
        <span class="tab__circle"><Icon name="plus" :size="22" :stroke="2" /></span>
        <span>만들기</span>
      </template>
      <template v-else>
        <Icon :name="tab.icon" :size="21" />
        <span>{{ tab.label }}</span>
      </template>
    </router-link>
  </nav>
</template>
