<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Check,
  Clock3,
  MessageCircle,
  Share2,
  ThumbsUp,
  Users,
  Vote,
} from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'
import type { VoteData } from '@/types'

const props = withDefaults(
  defineProps<{
    voteData: VoteData
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const emit = defineEmits<{
  vote: [payload: { optionIds: string[] }]
  open: []
  discuss: []
  share: []
  voteError: [payload: { optionIds: string[]; error: unknown }]
}>()

const localVoted = ref(false)
const localOptionIds = ref<string[]>([])
const submitting = ref(false)
const liked = ref(false)

const hasVoted = computed(() => props.voteData.hasVoted || localVoted.value)
const selectedIds = computed(() =>
  localVoted.value ? localOptionIds.value : (props.voteData.myOptionIds || []),
)

const displayOptions = computed(() => {
  const localSelections = localVoted.value ? localOptionIds.value : []
  return props.voteData.options.map((option) => ({
    ...option,
    votes: option.votes + (localSelections.includes(option.id) ? 1 : 0),
  }))
})

const totalVotes = computed(() => {
  const base = displayOptions.value.reduce((total, option) => total + option.votes, 0)
  return Math.max(base, hasVoted.value ? props.voteData.totalVotes + selectedIds.value.length : props.voteData.totalVotes)
})

const topOptionId = computed(() => {
  if (!displayOptions.value.length) return ''
  return [...displayOptions.value].sort((a, b) => b.votes - a.votes)[0]?.id || ''
})

const statusText = computed(() => {
  if (props.voteData.ended) return '已结束'
  if (props.voteData.remainingHours <= 24) return `剩余 ${props.voteData.remainingHours} 小时`
  return `剩余 ${Math.ceil(props.voteData.remainingHours / 24)} 天`
})

function percentage(votes: number) {
  if (!totalVotes.value) return 0
  return Math.round((votes / totalVotes.value) * 100)
}

function haptic() {
  if ('vibrate' in navigator) navigator.vibrate(10)
}

function commitVote(optionIds: string[]) {
  if (!optionIds.length || submitting.value) return
  haptic()
  localOptionIds.value = optionIds
  localVoted.value = true
  submitting.value = true
  emit('vote', { optionIds })

  // Parent can replace this timer with the API result and emit voteError on rejection.
  window.setTimeout(() => {
    submitting.value = false
  }, 650)
}

function chooseOption(optionId: string) {
  if (props.voteData.ended) {
    emit('open')
    return
  }
  if (hasVoted.value || submitting.value) return

  if (props.voteData.multiple) {
    haptic()
    localOptionIds.value = localOptionIds.value.includes(optionId)
      ? localOptionIds.value.filter((id) => id !== optionId)
      : [...localOptionIds.value, optionId]
    return
  }

  commitVote([optionId])
}

function confirmMultiVote() {
  if (!localOptionIds.value.length) return
  commitVote([...localOptionIds.value])
}
</script>

<template>
  <BaseCard :padded="false" class="overflow-hidden">
    <div class="border-b border-line/70 bg-gradient-to-r from-brand-50 via-white to-forumSoft/60 px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1 rounded-full bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white">
          <Vote :size="13" />
          投票
        </span>
        <span
          class="rounded-full px-2.5 py-1 text-[11px] font-medium"
          :class="voteData.ended ? 'bg-slate-100 text-faint' : 'bg-campusSoft text-campus'"
        >
          {{ statusText }}
        </span>
        <span v-if="voteData.multiple" class="rounded-full bg-forumSoft px-2.5 py-1 text-[11px] text-forum">
          多选
        </span>
      </div>
    </div>

    <div class="p-4">
      <button
        type="button"
        class="focus-ring block w-full text-left"
        @click="emit('open')"
      >
        <h2 class="text-base font-semibold leading-6 text-ink">{{ voteData.title }}</h2>
      </button>

      <div class="mt-4 space-y-3">
        <button
          v-for="option in displayOptions"
          :key="option.id"
          type="button"
          class="focus-ring group block w-full text-left disabled:cursor-default"
          :disabled="hasVoted || voteData.ended"
          :aria-pressed="selectedIds.includes(option.id)"
          @click="chooseOption(option.id)"
        >
          <div class="mb-1.5 flex items-center gap-2 text-xs">
            <span
              class="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium"
              :class="selectedIds.includes(option.id) ? 'text-brand-600' : 'text-slate-600'"
            >
              <span
                v-if="selectedIds.includes(option.id)"
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white"
              >
                <Check :size="11" :stroke-width="3" />
              </span>
              {{ option.label }}
            </span>
            <span class="shrink-0 tabular-nums text-muted">{{ percentage(option.votes) }}%</span>
          </div>
          <span class="relative block h-2.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60">
            <span
              class="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
              :class="
                option.id === topOptionId
                  ? 'bg-gradient-to-r from-brand-500 to-forum'
                  : selectedIds.includes(option.id)
                    ? 'bg-brand-400'
                    : 'bg-slate-300'
              "
              :style="{ width: `${percentage(option.votes)}%` }"
            />
          </span>
        </button>
      </div>

      <button
        v-if="voteData.multiple && !hasVoted && !voteData.ended"
        type="button"
        :disabled="!localOptionIds.length || submitting"
        class="focus-ring pressable mt-4 flex min-h-11 w-full items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white transition disabled:bg-slate-200 disabled:text-faint"
        @click="confirmMultiVote"
      >
        {{ submitting ? '提交中…' : `确认投票${localOptionIds.length ? `（${localOptionIds.length}）` : ''}` }}
      </button>

      <div class="mt-4 flex items-center gap-3 border-t border-line/70 pt-3 text-xs text-muted">
        <span class="flex items-center gap-1">
          <Users :size="14" />
          {{ totalVotes }} 人已参与
        </span>
        <span class="flex items-center gap-1">
          <Clock3 :size="14" />
          {{ statusText }}
        </span>
        <span v-if="voteData.anonymous" class="ml-auto text-[11px] text-faint">匿名投票</span>
      </div>

      <div class="mt-3 flex items-center gap-2">
        <button
          type="button"
          class="focus-ring min-h-11 rounded-full px-3 text-xs font-medium transition"
          :class="liked ? 'bg-brand-50 text-brand-600' : 'bg-slate-50 text-muted'"
          @click="liked = !liked"
        >
          <ThumbsUp :size="15" class="mr-1 inline" />
          赞同
        </button>
        <button
          type="button"
          class="focus-ring min-h-11 rounded-full bg-slate-50 px-3 text-xs font-medium text-muted"
          @click="emit('discuss')"
        >
          <MessageCircle :size="15" class="mr-1 inline" />
          查看讨论
        </button>
        <button
          type="button"
          class="focus-ring ml-auto min-h-11 rounded-full bg-slate-50 px-3 text-xs font-medium text-muted"
          @click="emit('share')"
        >
          <Share2 :size="15" class="mr-1 inline" />
          分享
        </button>
      </div>
    </div>
  </BaseCard>
</template>
