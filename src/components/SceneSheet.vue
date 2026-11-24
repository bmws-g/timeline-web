<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { activeTone } from '../lib/toneView'
import { MOODS, moodOf } from '../data/tones'
import type { MoodKey } from '../types'
import { addPerson, removeScene, state, toast, ui, updateScene } from '../store'
import { addDays, formatDate, fromKey, formatTime, toKey } from '../lib/date'
import { buildAutoSummary, buildTitle, coordinateLabel } from '../lib/scene'

const scene = computed(() => state.scenes.find((s) => s.id === ui.sceneSheetId) ?? null)
const tone = computed(() => activeTone())
const saving = ref(false)
const removing = ref(false)
const newPerson = ref('')

const form = reactive({
  note: '',
  mood: undefined as MoodKey | undefined,
  personIds: [] as string[],
  locationName: '',
  eventDate: '',
})

function reset() {
  const s = scene.value
  if (!s) return
  form.note = s.userNote ?? ''
  form.mood = s.mood
  form.personIds = [...s.personIds]
  form.locationName = s.locationName ?? ''
  form.eventDate = s.eventDate
  newPerson.value = ''
  removing.value = false
}

watch(() => ui.sceneSheetId, reset, { immediate: true })

const photos = computed(() => scene.value?.photos ?? [])
const gps = computed(() => {
  const s = scene.value
  if (!s) return ''
  return coordinateLabel(s.lat, s.lng)
})

const question = computed(() => {
  const s = scene.value
  const place = s?.locationName?.trim() || '오늘'
  return tone.value.interview(place)
})

function toggleMood(key: MoodKey) {
  form.mood = form.mood === key ? undefined : key
}

/** 선택된 기분 칩은 색을 조금 어둡게 해 흰 글자가 또렷하게 보이도록 한다. */
function moodStyle(key: MoodKey) {
  if (form.mood !== key) return undefined
  const tone = moodOf(key)?.tone ?? '#221f1a'
  const r = Math.round(parseInt(tone.slice(1, 3), 16) * 0.62)
  const g = Math.round(parseInt(tone.slice(3, 5), 16) * 0.62)
  const b = Math.round(parseInt(tone.slice(5, 7), 16) * 0.62)
  return {
    background: `rgb(${r}, ${g}, ${b})`,
    borderColor: `rgb(${r}, ${g}, ${b})`,
    color: '#fff',
    fontWeight: '600',
  }
}

function togglePerson(id: string) {
  if (form.personIds.includes(id)) {
    form.personIds = form.personIds.filter((p) => p !== id)
  } else {
    form.personIds = [...form.personIds, id]
  }
}

function createPerson() {
  const person = addPerson(newPerson.value)
  if (person && !form.personIds.includes(person.id)) {
    form.personIds = [...form.personIds, person.id]
  }
  newPerson.value = ''
}

function shiftDate(days: number) {
  const d = addDays(fromKey(form.eventDate), days)
  form.eventDate = toKey(d)
}

function save() {
  const s = scene.value
  if (!s || saving.value) return
  saving.value = true
  const locationName = form.locationName.trim()
  const dateChanged = form.eventDate !== s.eventDate
  const oldStart = new Date(s.startedAt)
  const newDate = fromKey(form.eventDate)
  newDate.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0)

  const startedAt = dateChanged ? newDate.toISOString() : s.startedAt
  const nextPhotos = s.photos
  updateScene(s.id, {
    eventDate: form.eventDate,
    startedAt,
    locationName: locationName || undefined,
    title: buildTitle({ locationName, startedAt, photos: nextPhotos }),
    autoSummary: buildAutoSummary({ photos: nextPhotos, startedAt, locationName }),
    userNote: form.note.trim() || undefined,
    mood: form.mood,
    personIds: [...form.personIds],
    interviewState: form.note.trim() ? 'answered' : s.interviewState === 'skipped' ? 'skipped' : 'pending',
  })
  saving.value = false
  close()
  toast(form.note.trim() ? '한 줄을 책에 남겼어요.' : '장면을 저장했어요.', 'success')
}

function skip() {
  const s = scene.value
  if (!s) return
  updateScene(s.id, { interviewState: 'skipped' })
  close()
  toast('이번 장면은 건너뛸게요. 사진과 시간으로 페이지를 채웁니다.', 'info')
}

function doRemove() {
  const s = scene.value
  if (!s) return
  removeScene(s.id)
  close()
}

function close() {
  ui.sceneSheetId = null
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})

const title = computed(() => {
  const s = scene.value
  if (!s) return ''
  return s.locationName || s.title
})
</script>

<template>
  <div v-if="scene" class="sheet-backdrop" @click.self="close">
    <section class="sheet" role="dialog" aria-modal="true" aria-label="장면 상세">
      <div class="sheet__grip" />

      <header class="sheet__head">
        <div>
          <p class="eyebrow">{{ formatDate(form.eventDate) }} · {{ formatTime(scene.startedAt) }}</p>
          <h2 class="sheet__title">{{ title }}</h2>
        </div>
        <button class="icon-btn icon-btn--plain" aria-label="닫기" @click="close">
          <Icon name="close" :size="18" />
        </button>
      </header>

      <div v-if="photos.length" class="sheet__section">
        <div class="photo-strip">
          <img v-for="photo in photos" :key="photo.id" :src="photo.thumb" :alt="photo.name" />
        </div>
        <p v-if="gps" class="hint" style="margin-top: 6px">
          <Icon name="map-pin" :size="11" style="vertical-align: -1px" /> 사진에서 읽은 좌표 {{ gps }}
        </p>
      </div>

      <div class="sheet__section">
        <p class="question__scene">{{ tone.label }} 톤의 질문</p>
        <p class="question">{{ question }}</p>
        <textarea
          v-model="form.note"
          class="textarea"
          rows="3"
          style="margin-top: 10px"
          placeholder="한 줄이면 충분해요. 나중에 이 문장이 책의 한 문단이 됩니다."
        />
      </div>

      <div class="sheet__section">
        <p class="label">그날의 기분</p>
        <div class="chip-row">
          <button
            v-for="mood in MOODS"
            :key="mood.key"
            class="chip chip--mood"
            :class="{ 'chip--active': form.mood === mood.key }"
            :style="moodStyle(mood.key)"
            @click="toggleMood(mood.key)"
          >
            <span>{{ mood.emoji }}</span>{{ mood.label }}
          </button>
        </div>
      </div>

      <div class="sheet__section">
        <p class="label">함께한 사람</p>
        <div class="chip-row">
          <button
            v-for="person in state.persons"
            :key="person.id"
            class="chip chip--person"
            :class="{ 'chip--active': form.personIds.includes(person.id) }"
            @click="togglePerson(person.id)"
          >
            {{ person.displayName }}
            <span v-if="person.disambiguator" class="tiny" style="opacity: 0.6">· {{ person.disambiguator }}</span>
          </button>
          <span v-if="state.persons.length === 0" class="tiny muted">아직 등록된 사람이 없어요.</span>
        </div>
        <div class="row" style="margin-top: 8px">
          <input
            v-model="newPerson"
            class="input"
            style="height: 38px; padding: 6px 11px; font-size: 13.5px"
            placeholder="새 사람 이름 (예: 김민수)"
            @keydown.enter.prevent="createPerson"
          />
          <button class="btn btn--ghost btn--sm" :disabled="!newPerson.trim()" @click="createPerson">추가</button>
        </div>
      </div>

      <div class="sheet__section">
        <p class="label">날짜와 장소</p>
        <div class="grid-2">
          <div class="field">
            <div class="row" style="gap: 4px">
              <button class="icon-btn icon-btn--plain" aria-label="하루 전" @click="shiftDate(-1)">
                <Icon name="chevron-left" :size="16" />
              </button>
              <input v-model="form.eventDate" class="input" type="date" style="font-size: 14px; padding: 9px 10px" />
              <button class="icon-btn icon-btn--plain" aria-label="하루 뒤" @click="shiftDate(1)">
                <Icon name="chevron-right" :size="16" />
              </button>
            </div>
          </div>
          <div class="field">
            <input v-model="form.locationName" class="input" placeholder="장소 (예: 신림동 카페)" style="font-size: 14px" />
          </div>
        </div>
      </div>

      <div class="row" style="margin-top: 22px; gap: 8px">
        <button class="btn btn--primary grow" :disabled="saving" @click="save">
          <Icon name="check" :size="17" /> 저장
        </button>
        <button class="btn btn--ghost" @click="skip">건너뛰기</button>
      </div>

      <div class="row-between" style="margin-top: 12px">
        <button v-if="!removing" class="btn btn--quiet" style="color: var(--muted)" @click="removing = true">
          <Icon name="trash" :size="15" /> 이 장면 삭제
        </button>
        <template v-else>
          <span class="tiny muted">정말 삭제할까요? 사진과 기록이 함께 사라집니다.</span>
          <span class="row" style="gap: 4px">
            <button class="btn btn--sm btn--danger" @click="doRemove">삭제</button>
            <button class="btn btn--sm btn--quiet" @click="removing = false">취소</button>
          </span>
        </template>
      </div>
    </section>
  </div>
</template>
