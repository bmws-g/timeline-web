<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import Avatar from '../components/Avatar.vue'
import SceneCard from '../components/SceneCard.vue'
import { formatDateLong, formatMonthDay } from '../lib/date'
import {
  addAlias,
  removeAlias,
  removePerson,
  scenesSorted,
  state,
  toast,
  ui,
  updatePerson,
} from '../store'

const route = useRoute()
const router = useRouter()

const person = computed(() => state.persons.find((p) => p.id === route.params.id) ?? null)

const scenes = computed(() => {
  const target = person.value
  if (!target) return []
  return scenesSorted.value.filter((s) => s.personIds.includes(target.id))
})

const groups = computed(() => {
  const map = new Map<number, typeof scenes.value>()
  for (const scene of scenes.value) {
    const year = new Date(scene.startedAt).getFullYear()
    const list = map.get(year) ?? []
    list.push(scene)
    map.set(year, list)
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([year, list]) => ({ year, scenes: list }))
})

const aliasInput = ref('')
const noteDraft = ref('')
const nameDraft = ref('')
const disqDraft = ref('')
const editingName = ref(false)
const confirmingDelete = ref(false)

watch(
  person,
  (value) => {
    noteDraft.value = value?.note ?? ''
    nameDraft.value = value?.displayName ?? ''
    disqDraft.value = value?.disambiguator ?? ''
    aliasInput.value = ''
    editingName.value = false
    confirmingDelete.value = false
  },
  { immediate: true },
)

function saveNote() {
  if (!person.value) return
  updatePerson(person.value.id, { note: noteDraft.value.trim() || undefined })
  toast('메모를 저장했어요.', 'success')
}

function saveName() {
  if (!person.value) return
  const name = nameDraft.value.trim()
  if (!name) {
    toast('이름을 입력해 주세요.', 'error')
    return
  }
  updatePerson(person.value.id, { displayName: name, disambiguator: disqDraft.value.trim() || undefined })
  editingName.value = false
  toast('이름을 저장했어요.', 'success')
}

function addAliasValue() {
  if (!person.value) return
  const value = aliasInput.value.trim()
  if (!value) return
  addAlias(person.value.id, value)
  aliasInput.value = ''
  toast(`호칭 ‘${value}’을 더했어요.`, 'success')
}

function deletePerson() {
  if (!person.value) return
  removePerson(person.value.id)
  router.replace('/people')
}

function openScene(id: string) {
  ui.sceneSheetId = id
}
</script>

<template>
  <div v-if="person" class="page">
    <header class="topbar">
      <router-link to="/people" class="icon-btn" aria-label="사람들로">
        <Icon name="chevron-left" :size="18" />
      </router-link>
      <button class="icon-btn icon-btn--plain" aria-label="이 인물 삭제" @click="confirmingDelete = true">
        <Icon name="trash" :size="17" />
      </button>
    </header>

    <section class="person-head">
      <Avatar :name="person.displayName" size="lg" />
      <div class="grow">
        <div v-if="!editingName">
          <h1>{{ person.displayName }}</h1>
          <p class="small muted" style="margin-top: 2px">
            {{ person.disambiguator || '내 기록 속 인물' }}
            <button class="btn btn--quiet btn--sm" style="height: 22px; padding: 0 6px" @click="editingName = true">
              <Icon name="pencil" :size="12" /> 수정
            </button>
          </p>
        </div>
        <div v-else class="stack-sm">
          <div class="row">
            <input v-model="nameDraft" class="input" style="height: 36px; font-size: 14px" placeholder="이름" />
            <input v-model="disqDraft" class="input" style="height: 36px; font-size: 13px; width: 100px" placeholder="구분" />
          </div>
          <div class="row" style="justify-content: flex-end">
            <button class="btn btn--sm btn--quiet" @click="editingName = false">취소</button>
            <button class="btn btn--sm btn--primary" @click="saveName">저장</button>
          </div>
        </div>
      </div>
    </section>

    <div class="stat-row" style="margin-top: 4px">
      <div class="stat">
        <b>{{ scenes.length }}</b>
        <span>함께한 장면</span>
      </div>
      <div class="stat">
        <b style="font-size: 15px; line-height: 1.7">{{ scenes.length ? formatMonthDay(scenes[scenes.length - 1].eventDate) : '—' }}</b>
        <span>처음</span>
      </div>
      <div class="stat">
        <b style="font-size: 15px; line-height: 1.7">{{ scenes.length ? formatMonthDay(scenes[0].eventDate) : '—' }}</b>
        <span>최근</span>
      </div>
    </div>

    <div v-if="confirmingDelete" class="card" style="margin-top: 16px; border-color: #efd6cf; background: #fdf4f1">
      <p class="small" style="color: #8d2f24">
        {{ person.displayName }} 님을 명부에서 지울까요? 장면에 붙은 태그만 사라지고 기록은 남습니다.
      </p>
      <div class="row" style="margin-top: 10px; justify-content: flex-end">
        <button class="btn btn--sm btn--quiet" @click="confirmingDelete = false">취소</button>
        <button class="btn btn--sm btn--danger" @click="deletePerson">삭제</button>
      </div>
    </div>

    <div class="section-head">
      <h2>호칭 이력</h2>
      <span class="more">시간에 따라 바뀐 이름</span>
    </div>
    <div class="card">
      <div class="chip-row">
        <span class="chip chip--accent">{{ person.displayName }}</span>
        <span v-for="alias in person.aliases" :key="alias" class="chip">
          {{ alias }}
          <button aria-label="호칭 지우기" style="display: inline-flex; color: var(--faint)" @click="removeAlias(person.id, alias)">
            <Icon name="close" :size="11" />
          </button>
        </span>
        <span v-if="!person.aliases.length" class="tiny muted" style="align-self: center">아직 별칭이 없어요</span>
      </div>
      <div class="row" style="margin-top: 10px">
        <input
          v-model="aliasInput"
          class="input"
          style="height: 36px; font-size: 13.5px"
          placeholder="예전 호칭 (김대리, 민수형)"
          @keydown.enter.prevent="addAliasValue"
        />
        <button class="btn btn--ghost btn--sm" :disabled="!aliasInput.trim()" @click="addAliasValue">추가</button>
      </div>
    </div>

    <div class="section-head">
      <h2>이 사람에 대한 메모</h2>
    </div>
    <div class="card">
      <textarea
        v-model="noteDraft"
        class="textarea"
        rows="2"
        style="border: none; padding: 0; background: transparent; font-family: var(--serif); font-size: 14.5px"
        placeholder="어떤 사이인지, 무엇을 함께 했는지 적어 두세요."
      />
      <div class="row" style="justify-content: flex-end">
        <button class="btn btn--sm btn--quiet" @click="saveNote">메모 저장</button>
      </div>
    </div>

    <div class="section-head">
      <h2>함께한 장면</h2>
      <span class="more">최근순</span>
    </div>

    <div v-if="scenes.length" class="stack">
      <section v-for="group in groups" :key="group.year">
        <p class="day-head" style="padding-bottom: 6px"><b>{{ group.year }}년</b><span>{{ group.scenes.length }}장면</span></p>
        <div class="stack-sm">
          <SceneCard v-for="scene in group.scenes" :key="scene.id" :scene="scene" show-date @open="openScene" />
        </div>
      </section>
    </div>
    <div v-else class="empty">
      <h3>아직 함께한 장면이 없어요</h3>
      <p>장면을 열어 이 사람을 태그하면 여기에 모입니다.</p>
    </div>

    <p class="hint" style="margin-top: 24px; text-align: center">
      처음 기록 {{ scenes.length ? formatDateLong(scenes[scenes.length - 1].eventDate) : '—' }}
    </p>
  </div>

  <div v-else class="page page--no-tabs">
    <header class="topbar">
      <router-link to="/people" class="icon-btn" aria-label="뒤로">
        <Icon name="chevron-left" :size="18" />
      </router-link>
    </header>
    <div class="empty" style="margin-top: 20px">
      <h3>이 사람을 찾을 수 없어요</h3>
      <p>삭제되었거나 다른 기기에서 만들어진 인물입니다.</p>
      <router-link to="/people" class="btn btn--ghost" style="margin-top: 14px">사람들로</router-link>
    </div>
  </div>
</template>
