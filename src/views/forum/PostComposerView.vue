<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  EyeOff,
  GripVertical,
  ImagePlus,
  LockKeyhole,
  MessageSquareText,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UsersRound,
  Vote,
} from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import PillSelector from '@/components/ui/PillSelector.vue'
import { boardOptions } from '@/data/mock'

const board = ref('社团同好')
const kind = ref<'normal' | 'topic' | 'vote'>('normal')
const anonymous = ref(false)
const title = ref('')
const content = ref('')
const submitting = ref(false)
const voteMultiple = ref(false)
const voteDeadline = ref<24 | 72 | 168 | 'custom'>(72)
const customDeadline = ref('')
const voteAnonymous = ref(true)
const voteVisibility = ref('全部可见')
const draggedOptionId = ref('')
const voteOptions = ref([
  { id: 'vote-option-1', label: '' },
  { id: 'vote-option-2', label: '' },
  { id: 'vote-option-3', label: '' },
  { id: 'vote-option-4', label: '' },
])
let optionSequence = 5

const isCourseBoard = computed(() => board.value === '课程评价')
const filledVoteOptions = computed(() =>
  voteOptions.value.filter((option) => option.label.trim().length > 0),
)
const canSubmit = computed(() => {
  if (!title.value.trim()) return false
  if (kind.value === 'topic') return true
  if (kind.value === 'vote') return filledVoteOptions.value.length >= 2
  return content.value.trim().length > 0
})

function toggleAnonymous() {
  anonymous.value = !anonymous.value
  if (anonymous.value && 'vibrate' in navigator) navigator.vibrate(10)
}

function submitPreview() {
  submitting.value = true
  window.setTimeout(() => {
    submitting.value = false
  }, 900)
}

function addVoteOption() {
  if (voteOptions.value.length >= 10) return
  voteOptions.value.push({
    id: `vote-option-${optionSequence}`,
    label: '',
  })
  optionSequence += 1
}

function removeVoteOption(id: string) {
  if (voteOptions.value.length <= 2) return
  voteOptions.value = voteOptions.value.filter((option) => option.id !== id)
}

function moveVoteOption(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= voteOptions.value.length) return
  const next = [...voteOptions.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  voteOptions.value = next
}

function startOptionDrag(id: string) {
  draggedOptionId.value = id
}

function dropOption(targetId: string) {
  if (!draggedOptionId.value || draggedOptionId.value === targetId) return
  const from = voteOptions.value.findIndex((option) => option.id === draggedOptionId.value)
  const to = voteOptions.value.findIndex((option) => option.id === targetId)
  if (from < 0 || to < 0) return
  const next = [...voteOptions.value]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  voteOptions.value = next
  draggedOptionId.value = ''
}
</script>

<template>
  <div class="page-scroll space-y-3 animate-fade-up">
    <BaseCard>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-ink">选择板块</h2>
        <span class="text-[11px] text-faint">默认发布到闲聊</span>
      </div>
      <PillSelector v-model="board" :items="boardOptions" accent="forum" />
      <div
        v-if="board === '活动组队' || board === '社团同好'"
        class="mt-3 flex items-start gap-2 rounded-inner bg-campusSoft px-3 py-2.5 text-xs leading-5 text-campus"
      >
        <ShieldCheck :size="16" class="mt-0.5 shrink-0" />
        这个板块可以留群号和联系方式，拉人进群属于正常内容。
      </div>
    </BaseCard>

    <BaseCard v-if="isCourseBoard">
      <h2 class="mb-3 text-sm font-semibold text-ink">关联课程</h2>
      <div class="flex h-11 items-center rounded-inner border border-brand-100 bg-brand-50 px-3 text-sm text-brand-600">
        <span>战略管理</span>
        <button type="button" class="ml-auto text-xs text-muted">更换</button>
      </div>
    </BaseCard>

    <BaseCard>
      <h2 class="mb-3 text-sm font-semibold text-ink">帖子形式</h2>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="item in [
            { key: 'normal' as const, title: '普通帖', desc: '标题 + 正文' },
            { key: 'topic' as const, title: '只发主题', desc: '信息留给评论区' },
            { key: 'vote' as const, title: '发起投票', desc: '收集大家选择' },
          ]"
          :key="item.key"
          type="button"
          class="focus-ring min-h-[82px] rounded-inner border p-2.5 text-left transition-all duration-300 ease-out active:scale-[0.98]"
          :class="
            kind === item.key
              ? item.key === 'vote'
                ? 'border-brand-500 bg-brand-50 text-brand-600'
                : 'border-forum bg-forumSoft text-forum'
              : 'border-line bg-white text-ink'
          "
          @click="kind = item.key"
        >
          <Vote v-if="item.key === 'vote'" :size="17" class="mb-1.5" />
          <span class="block text-sm font-semibold">{{ item.title }}</span>
          <span class="mt-1 block text-[10px] leading-4 opacity-70">{{ item.desc }}</span>
        </button>
      </div>
    </BaseCard>

    <BaseCard>
      <label class="block">
        <span class="mb-3 block text-sm font-semibold text-ink">标题</span>
        <input
          v-model="title"
          maxlength="30"
          class="h-11 w-full rounded-inner border border-line bg-slate-50 px-3 text-sm outline-none transition focus:border-forum focus:bg-white"
          :placeholder="kind === 'vote' ? '填写投票标题，最多 30 字' : '一句话说清你的主题'"
        />
      </label>

      <Transition name="compose-collapse">
        <div v-if="kind === 'normal'" class="mt-4 overflow-hidden">
          <label class="block">
            <span class="mb-3 block text-sm font-semibold text-ink">正文</span>
            <textarea
              v-model="content"
              maxlength="500"
              class="min-h-36 w-full resize-none rounded-inner border border-line bg-slate-50 p-3 text-sm leading-6 outline-none transition focus:border-forum focus:bg-white"
              placeholder="闲置分享、失物寻物、组队计划…"
            />
          </label>
          <p class="mt-1 text-right text-[11px] text-faint">{{ content.length }}/500</p>
        </div>
      </Transition>

      <Transition name="topic-hint">
        <div
          v-if="kind === 'topic'"
          class="mt-4 flex items-start gap-2 rounded-inner border border-dashed border-forum/25 bg-forumSoft/60 p-3 text-xs leading-5 text-forum"
        >
          <MessageSquareText :size="17" class="mt-0.5 shrink-0" />
          只写标题，群号、地点或报名方式留给评论区补充。
        </div>
      </Transition>
    </BaseCard>

    <Transition name="vote-panel">
        <BaseCard
          v-if="kind === 'vote'"
          class="mt-4 border-brand-100 bg-gradient-to-br from-brand-50/70 to-white"
        >
          <div class="flex items-center gap-2">
            <span class="flex h-9 w-9 items-center justify-center rounded-inner bg-brand-500 text-white">
              <Vote :size="18" />
            </span>
            <div>
              <h2 class="text-sm font-semibold text-ink">投票设置</h2>
              <p class="mt-0.5 text-[11px] text-muted">至少填写 2 个选项，最多 10 个</p>
            </div>
          </div>

          <div class="mt-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-xs font-medium text-muted">投票选项</span>
              <span class="text-[11px] text-faint">{{ voteOptions.length }}/10</span>
            </div>

            <TransitionGroup name="vote-option" tag="div" class="space-y-2">
              <div
                v-for="(option, index) in voteOptions"
                :key="option.id"
                draggable="true"
                class="flex items-center gap-1.5 rounded-inner border border-line bg-white p-1.5 shadow-sm transition"
                :class="draggedOptionId === option.id ? 'border-brand-300 opacity-60' : ''"
                @dragstart="startOptionDrag(option.id)"
                @dragover.prevent
                @drop="dropOption(option.id)"
                @dragend="draggedOptionId = ''"
              >
                <span
                  class="flex h-11 w-7 cursor-grab items-center justify-center text-faint active:cursor-grabbing"
                  title="拖拽排序"
                >
                  <GripVertical :size="16" />
                </span>
                <input
                  v-model="option.label"
                  maxlength="30"
                  class="h-11 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-faint"
                  :placeholder="`选项 ${index + 1}`"
                />
                <button
                  type="button"
                  class="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-inner text-faint transition hover:bg-slate-100 disabled:opacity-25"
                  :disabled="index === 0"
                  aria-label="上移选项"
                  @click="moveVoteOption(index, -1)"
                >
                  <ArrowUp :size="15" />
                </button>
                <button
                  type="button"
                  class="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-inner text-faint transition hover:bg-slate-100 disabled:opacity-25"
                  :disabled="index === voteOptions.length - 1"
                  aria-label="下移选项"
                  @click="moveVoteOption(index, 1)"
                >
                  <ArrowDown :size="15" />
                </button>
                <button
                  type="button"
                  class="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-inner text-danger transition hover:bg-dangerSoft disabled:opacity-25"
                  :disabled="voteOptions.length <= 2"
                  aria-label="删除选项"
                  @click="removeVoteOption(option.id)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
            </TransitionGroup>

            <button
              type="button"
              :disabled="voteOptions.length >= 10"
              class="focus-ring pressable mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-inner border border-dashed border-brand-200 bg-white text-xs font-medium text-brand-600 transition disabled:cursor-not-allowed disabled:opacity-40"
              @click="addVoteOption"
            >
              <Plus :size="16" />
              添加选项
            </button>
          </div>

          <div class="mt-4 border-t border-brand-100/70 pt-4">
            <span class="text-xs font-medium text-muted">投票类型</span>
            <div class="mt-2 grid grid-cols-2 rounded-inner bg-slate-100 p-1">
              <button
                v-for="item in [
                  { value: false, label: '单选', hint: '只能选择一项' },
                  { value: true, label: '多选', hint: '可选择多项' },
                ]"
                :key="String(item.value)"
                type="button"
                class="focus-ring min-h-10 rounded-[9px] px-3 text-xs font-medium transition-all duration-300"
                :class="
                  voteMultiple === item.value
                    ? 'bg-white text-brand-600 shadow-sm'
                    : 'text-muted'
                "
                @click="voteMultiple = item.value"
              >
                {{ item.label }}
                <span class="ml-1 text-[10px] opacity-60">{{ item.hint }}</span>
              </button>
            </div>
          </div>

          <div class="mt-4 border-t border-brand-100/70 pt-4">
            <span class="text-xs font-medium text-muted">截止时间</span>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="item in [
                  { value: 24 as const, label: '24小时' },
                  { value: 72 as const, label: '3天' },
                  { value: 168 as const, label: '7天' },
                  { value: 'custom' as const, label: '自定义' },
                ]"
                :key="String(item.value)"
                type="button"
                class="focus-ring min-h-10 rounded-full border px-3.5 text-xs font-medium transition"
                :class="
                  voteDeadline === item.value
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-line bg-white text-muted'
                "
                @click="voteDeadline = item.value"
              >
                {{ item.label }}
              </button>
            </div>
            <label
              v-if="voteDeadline === 'custom'"
              class="mt-3 flex h-11 items-center gap-2 rounded-inner border border-line bg-white px-3"
            >
              <CalendarClock :size="16" class="text-brand-500" />
              <input
                v-model="customDeadline"
                type="datetime-local"
                class="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none"
              />
            </label>
          </div>

          <div class="mt-4 space-y-3 border-t border-brand-100/70 pt-4">
            <div class="flex items-center gap-3">
              <LockKeyhole :size="17" class="shrink-0 text-brand-500" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-ink">匿名投票</p>
                <p class="mt-0.5 text-[11px] text-faint">开启后不公开投票者身份，服务端仍保留防刷标识</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="voteAnonymous"
                class="relative h-7 w-12 shrink-0 rounded-full transition"
                :class="voteAnonymous ? 'bg-brand-500' : 'bg-slate-200'"
                @click="voteAnonymous = !voteAnonymous"
              >
                <span
                  class="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all"
                  :class="voteAnonymous ? 'left-6' : 'left-1'"
                />
              </button>
            </div>

            <label class="flex items-center gap-3">
              <UsersRound :size="17" class="shrink-0 text-brand-500" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-ink">可见范围</p>
                <p class="mt-0.5 text-[11px] text-faint">特定院系投票仅绑定了对应学院身份的用户可参与</p>
              </div>
              <select
                v-model="voteVisibility"
                class="h-10 rounded-inner border border-line bg-white px-2 text-xs text-ink outline-none"
              >
                <option>全部可见</option>
                <option>仅关注者可见</option>
                <option>特定院系可见</option>
              </select>
            </label>
          </div>

          <div
            class="mt-4 rounded-inner px-3 py-2.5 text-xs"
            :class="
              filledVoteOptions.length >= 2
                ? 'bg-campusSoft text-campus'
                : 'bg-amber-50 text-amber-700'
            "
          >
            {{
              filledVoteOptions.length >= 2
                ? `已填写 ${filledVoteOptions.length} 个有效选项，可以发布`
                : `至少填写 2 个选项，当前 ${filledVoteOptions.length}/2`
            }}
          </div>
      </BaseCard>
    </Transition>

    <BaseCard>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-ink">配图</h2>
        <span class="text-[11px] text-faint">最多 6 张</span>
      </div>
      <button
        type="button"
        class="focus-ring pressable flex h-24 w-24 flex-col items-center justify-center gap-2 rounded-inner border border-dashed border-slate-300 bg-slate-50 text-xs text-faint"
      >
        <ImagePlus :size="24" />
        添加图片
      </button>
    </BaseCard>

    <BaseCard
      clickable
      class="border-forum/10"
      @click="toggleAnonymous"
    >
      <div class="flex items-center gap-3">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-inner transition"
          :class="anonymous ? 'bg-forum text-white' : 'bg-slate-100 text-muted'"
        >
          <EyeOff :size="20" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-ink">匿名发布</p>
          <p class="mt-1 text-xs leading-5 text-muted">
            头像、昵称和身份标识不会对其他同学展示；违规内容平台仍可追溯。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="anonymous"
          class="relative h-7 w-12 shrink-0 rounded-full transition"
          :class="anonymous ? 'bg-forum' : 'bg-slate-200'"
          @click.stop="toggleAnonymous"
        >
          <span
            class="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all"
            :class="anonymous ? 'left-6' : 'left-1'"
          />
        </button>
      </div>
    </BaseCard>

    <div class="grid grid-cols-[0.8fr_1.2fr] gap-3 pt-1">
      <BaseButton variant="secondary" block>存草稿</BaseButton>
      <BaseButton
        block
        :disabled="!canSubmit"
        :loading="submitting"
        @click="submitPreview"
      >
        <Send v-if="!submitting" :size="17" />
        {{ submitting ? '发布中' : '发布帖子' }}
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.compose-collapse-enter-active,
.compose-collapse-leave-active {
  max-height: 420px;
  overflow: hidden;
  transition:
    max-height 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease,
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}

.compose-collapse-enter-from,
.compose-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-8px);
}

.compose-collapse-enter-to,
.compose-collapse-leave-from {
  max-height: 420px;
  opacity: 1;
  transform: translateY(0);
}

.topic-hint-enter-active,
.topic-hint-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.topic-hint-enter-from,
.topic-hint-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.vote-panel-enter-active,
.vote-panel-leave-active {
  max-height: 2000px;
  overflow: hidden;
  transition:
    max-height 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.24s ease,
    transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.vote-panel-enter-from,
.vote-panel-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-10px);
}

.vote-option-enter-active,
.vote-option-leave-active,
.vote-option-move {
  transition:
    opacity 0.24s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.vote-option-enter-from,
.vote-option-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
