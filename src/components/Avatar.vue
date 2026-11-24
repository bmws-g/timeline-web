<script setup lang="ts">
import { computed } from 'vue'
import { hash } from '../lib/id'

const props = defineProps<{ name: string; size?: 'md' | 'lg' }>()

const PALETTE = ['#eadfd2', '#dfe7dc', '#e6e0ea', '#f0e3d9', '#dfe4ea', '#ece5d3', '#e9e2d8']

const style = computed(() => {
  const color = PALETTE[hash(props.name) % PALETTE.length]
  return { background: color }
})

const initial = computed(() => props.name.trim().slice(0, 1) || '?')
</script>

<template>
  <span class="avatar" :class="{ 'avatar--lg': size === 'lg' }" :style="style" aria-hidden="true">{{ initial }}</span>
</template>
