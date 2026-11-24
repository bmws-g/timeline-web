<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import { TONES } from '../data/tones'
import { verifyGeminiKey } from '../lib/gemini'
import { activeTone } from '../lib/toneView'
import { formatDate } from '../lib/date'
import {
  clearSample,
  exportJson,
  hasSample,
  importJson,
  loadDemo,
  resetAll,
  setTone,
  state,
  toast,
  ui,
} from '../store'

const tone = computed(() => activeTone())
const showKey = ref(false)
const verifying = ref(false)
const keyStatus = ref<'idle' | 'ok' | 'fail'>('idle')
const confirmingReset = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)

const samplePresent = computed(() => hasSample())

function toggleAI() {
  state.settings.useAI = !state.settings.useAI
  if (state.settings.useAI && !state.settings.geminiKey.trim()) {
    toast('Gemini API 키를 먼저 넣어 주세요. 없으면 로컬 문장으로 씁니다.', 'info')
  }
}

async function verify() {
  if (!state.settings.geminiKey.trim()) {
    toast('API 키를 먼저 입력해 주세요.', 'error')
    return
  }
  verifying.value = true
  try {
    const ok = await verifyGeminiKey(state.settings.geminiKey)
    keyStatus.value = ok ? 'ok' : 'fail'
    toast(ok ? '키가 확인되었어요. 이제 AI가 글을 씁니다.' : '키를 확인하지 못했어요. 값을 다시 확인해 주세요.', ok ? 'success' : 'error')
  } catch {
    keyStatus.value = 'fail'
    toast('키를 확인하지 못했어요. 네트워크나 키 값을 확인해 주세요.', 'error')
  } finally {
    verifying.value = false
  }
}

function toggleSample() {
  if (samplePresent.value) {
    clearSample()
  } else {
    loadDemo(state.toneKey)
  }
}

function doReset() {
  resetAll()
  confirmingReset.value = false
}

function onImportChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  const reader = new FileReader()
  reader.onload = () => {
    const ok = importJson(String(reader.result ?? ''))
    importing.value = false
    if (ok) window.location.hash = '#/'
  }
  reader.onerror = () => {
    toast('파일을 읽지 못했어요.', 'error')
    importing.value = false
  }
  reader.readAsText(file)
  input.value = ''
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <router-link to="/" class="icon-btn" aria-label="홈으로">
        <Icon name="chevron-left" :size="18" />
      </router-link>
      <h1 style="font-size: 19px">설정</h1>
      <span style="width: 38px" />
    </header>

    <div v-if="ui.storageWarning" class="card" style="border-color: #efd6cf; background: #fdf4f1; margin-bottom: 14px">
      <p class="small" style="color: #8d2f24">
        브라우저 저장 공간이 가득 찼어요. 사진이 많은 장면을 정리하거나 백업 후 샘플을 지워 주세요.
      </p>
    </div>

    <section class="settings-group" style="margin-top: 8px">
      <h2>자서전 톤</h2>
      <div class="card">
        <div class="chip-row">
          <button
            v-for="item in TONES"
            :key="item.key"
            class="chip"
            :class="{ 'chip--active': state.toneKey === item.key }"
            @click="setTone(item.key)"
          >
            {{ item.label }}
          </button>
        </div>
        <p class="hint" style="margin-top: 10px">{{ tone.description }}</p>
        <p class="note-quote" style="margin-top: 10px">{{ tone.sample }}</p>
        <p class="tiny muted" style="margin-top: 8px">톤을 바꾸면 앞으로 엮는 글부터 적용됩니다. 지난 챕터는 그대로 남아요.</p>
      </div>
    </section>

    <section class="settings-group">
      <h2>밤의 한 줄 인터뷰</h2>
      <div class="settings-row">
        <div>
          <p class="settings-row__t">질문 시간</p>
          <p class="settings-row__d">알림을 켜지 않아도 앱을 열면 카드로 기다려요</p>
        </div>
        <input v-model="state.interviewTime" type="time" class="input" style="width: 120px; font-size: 14px" />
      </div>
    </section>

    <section class="settings-group">
      <h2>AI 문장 (선택)</h2>
      <div class="settings-row">
        <div>
          <p class="settings-row__t">Gemini로 글쓰기</p>
          <p class="settings-row__d">키가 없으면 로컬 문장 조합기로 동작합니다</p>
        </div>
        <button class="switch" :class="{ on: state.settings.useAI }" role="switch" :aria-checked="state.settings.useAI" @click="toggleAI" />
      </div>
      <div class="settings-row settings-row--stack">
        <div class="row-between" style="margin-bottom: 6px">
          <p class="settings-row__t">Gemini API 키</p>
          <span v-if="keyStatus === 'ok'" class="key-status"><Icon name="check" :size="12" /> 확인됨</span>
          <span v-else-if="keyStatus === 'fail'" class="key-status" style="color: #a3352a">확인 실패</span>
        </div>
        <div class="row">
          <input
            v-model="state.settings.geminiKey"
            class="input"
            :type="showKey ? 'text' : 'password'"
            placeholder="AIza…"
            autocomplete="off"
            spellcheck="false"
            @input="keyStatus = 'idle'"
          />
          <button class="icon-btn" :aria-label="showKey ? '키 가리기' : '키 보기'" @click="showKey = !showKey">
            <Icon name="key" :size="17" />
          </button>
        </div>
        <div class="row-between" style="margin-top: 8px">
          <p class="hint">키는 이 브라우저에만 저장되고, 기능을 끄면 호출되지 않아요.</p>
          <button class="btn btn--sm btn--ghost" :disabled="verifying" @click="verify">
            {{ verifying ? '확인 중…' : '키 확인' }}
          </button>
        </div>
        <p class="tiny muted" style="margin-top: 6px">
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style="text-decoration: underline">
            Google AI Studio
          </a>
          에서 무료 키를 만들 수 있어요. 배포된 앱에서는 서버 함수로 키를 감추는 편을 권합니다.
        </p>
      </div>
    </section>

    <section class="settings-group">
      <h2>기록과 백업</h2>
      <div class="settings-row">
        <div>
          <p class="settings-row__t">기록 현황</p>
          <p class="settings-row__d">장면 {{ state.scenes.length }} · 챕터 {{ state.chapters.length }} · 사람 {{ state.persons.length }}</p>
        </div>
        <span class="badge">이 기기에 저장</span>
      </div>
      <div class="settings-row">
        <div>
          <p class="settings-row__t">샘플 기록</p>
          <p class="settings-row__d">{{ samplePresent ? '샘플이 들어 있어요' : '샘플 없이 내 기록만' }}</p>
        </div>
        <button class="btn btn--sm btn--ghost" @click="toggleSample">{{ samplePresent ? '샘플 지우기' : '샘플 채우기' }}</button>
      </div>
      <div class="settings-row">
        <div>
          <p class="settings-row__t">JSON으로 내보내기</p>
          <p class="settings-row__d">기록·썸네일·챕터를 한 파일로</p>
        </div>
        <button class="btn btn--sm btn--ghost" @click="exportJson"><Icon name="download" :size="15" /> 내보내기</button>
      </div>
      <div class="settings-row">
        <div>
          <p class="settings-row__t">백업 불러오기</p>
          <p class="settings-row__d">같은 형식의 JSON으로 복원합니다</p>
        </div>
        <button class="btn btn--sm btn--ghost" :disabled="importing" @click="importInput?.click()">
          <Icon name="upload" :size="15" /> 불러오기
        </button>
      </div>
      <input ref="importInput" type="file" accept="application/json,.json" class="sr-only" @change="onImportChange" />
      <div class="settings-row">
        <div>
          <p class="settings-row__t">모두 지우기</p>
          <p class="settings-row__d">이 브라우저의 장면·챕터·사람·설정</p>
        </div>
        <button v-if="!confirmingReset" class="btn btn--sm btn--danger" @click="confirmingReset = true">초기화</button>
        <span v-else class="row" style="gap: 4px">
          <button class="btn btn--sm btn--quiet" @click="confirmingReset = false">취소</button>
          <button class="btn btn--sm btn--danger" @click="doReset">정말 지우기</button>
        </span>
      </div>
    </section>

    <section class="settings-group">
      <h2>앱 정보</h2>
      <div class="settings-row settings-row--stack">
        <p class="settings-row__t">타임라인 · 무료 웹 MVP</p>
        <p class="hint" style="margin-top: 4px">
          사진은 브라우저 안에서만 처리되어 작은 썸네일로 이 기기에 저장됩니다. 기록은 서버 없이
          localStorage에 남고, 무료 정적 호스팅(Vercel·Cloudflare Pages)에 그대로 올릴 수 있어요.
        </p>
        <p class="tiny muted" style="margin-top: 8px">
          Supabase 연결 안내는 프로젝트의 README.md에 정리되어 있습니다. 이 기기의 마지막 기록:
          {{ state.scenes.length ? formatDate(state.scenes.map((s) => s.eventDate).sort().slice(-1)[0]) : '아직 없음' }}
        </p>
      </div>
    </section>

    <p class="hint" style="margin-top: 24px; text-align: center">
      고른 톤 · {{ tone.label }} · 질문 {{ state.interviewTime }}
    </p>
  </div>
</template>
