<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TabBar from './components/TabBar.vue'
import SceneSheet from './components/SceneSheet.vue'
import { state, ui } from './store'

const route = useRoute()
const showTabs = computed(() => state.onboarded && !route.meta.hideTabs)
</script>

<template>
  <div class="app-shell">
    <router-view v-slot="{ Component }">
      <transition name="view" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <TabBar v-if="showTabs" />
    <SceneSheet v-if="ui.sceneSheetId" />

    <transition name="fade">
      <div v-if="ui.toast" :key="ui.toast.id" class="toast" :class="`toast--${ui.toast.tone}`" role="status">
        {{ ui.toast.message }}
      </div>
    </transition>
  </div>
</template>
