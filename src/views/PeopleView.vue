<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import Avatar from '../components/Avatar.vue'
import { formatDate } from '../lib/date'
import { personStats, state } from '../store'

const router = useRouter()
const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim()
  if (!q) return personStats.value
  return personStats.value.filter((item) => {
    const names = [item.person.displayName, ...item.person.aliases, item.person.disambiguator ?? '']
    return names.some((name) => name.includes(q))
  })
})

const untagged = computed(() => state.scenes.filter((s) => s.personIds.length === 0).length)
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div>
        <p class="eyebrow">등장인물</p>
        <h1 style="font-size: 24px; margin-top: 2px">사람들</h1>
      </div>
      <router-link to="/settings" class="icon-btn" aria-label="설정">
        <Icon name="gear" :size="19" />
      </router-link>
    </header>

    <div class="field" style="margin-bottom: 14px">
      <input v-model="query" class="input" placeholder="이름이나 호칭으로 찾기 (예: 민수)" />
    </div>

    <div v-if="filtered.length" class="stack-sm">
      <button
        v-for="item in filtered"
        :key="item.person.id"
        class="person-row"
        @click="router.push(`/people/${item.person.id}`)"
      >
        <Avatar :name="item.person.displayName" />
        <span class="grow">
          <span class="person-row__name">
            {{ item.person.displayName }}
            <span v-if="item.person.disambiguator" class="badge">{{ item.person.disambiguator }}</span>
          </span>
          <span class="person-row__meta">
            함께한 장면 {{ item.count }}개
            <template v-if="item.lastSeenOn"> · 최근 {{ formatDate(item.lastSeenOn) }}</template>
          </span>
        </span>
        <Icon name="chevron-right" :size="16" style="color: var(--faint)" />
      </button>
    </div>

    <div v-else class="empty">
      <svg class="empty__art" viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="1.4">
        <circle cx="46" cy="34" r="13" />
        <path d="M24 72c0-12 10-20 22-20s22 8 22 20" stroke-linecap="round" />
        <circle cx="84" cy="40" r="9" />
        <path d="M72 70c1-9 6-14 12-14s11 5 12 14" stroke-linecap="round" />
      </svg>
      <h3>{{ query ? '찾는 사람이 없어요' : '아직 등록된 사람이 없어요' }}</h3>
      <p>
        {{ query ? '다른 이름이나 호칭으로 찾아보세요.' : '장면을 열어 “함께한 사람”을 태그하면 여기에 모입니다.' }}
      </p>
      <router-link v-if="!query" to="/" class="btn btn--ghost" style="margin-top: 14px">장면 보러 가기</router-link>
    </div>

    <div v-if="!query && untagged > 0" class="card card--paper" style="margin-top: 18px">
      <div class="row" style="align-items: flex-start; gap: 10px">
        <Icon name="users" :size="18" style="color: var(--accent); flex: none; margin-top: 2px" />
        <p class="tiny" style="color: var(--ink-soft); line-height: 1.6">
          아직 사람을 태그하지 않은 장면이 {{ untagged }}개 있어요. 장면 카드를 열고 함께한 사람을 눌러 두면
          그 사람의 타임라인이 함께 쌓입니다.
        </p>
      </div>
    </div>

    <p class="hint" style="margin-top: 22px; text-align: center">
      인물은 내 기록 속 사본으로 저장됩니다. 나중에 실제 계정과 연결해도 서로의 기억을 덮어쓰지 않아요.
    </p>
  </div>
</template>
