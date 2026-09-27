<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Check,
  Clock3,
  Flame,
  MessageCircle,
  Pin,
  RefreshCw,
  Share2,
  Sparkles,
  ThumbsUp,
  Users,
  Vote,
} from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { VOTE_API_ENABLED } from '@/config/app'
import { posts } from '@/data/mock'
import { fetchVoteResults, startVotePolling } from '@/services/vote'
import type { VoteData } from '@/types'

const route = useRoute()
const post = posts.find((item) => item.id === route.params.id)
const poll = ref<VoteData | null>(
  post?.kind === 'vote' && post.voteData ? structuredClone(post.voteData) : null,
)

const selectedIds = ref<string[]>(poll.value?.myOptionIds || [])
const submitting = ref(false)
const justVoted = ref(false)
const showConfetti = ref(false)
const refreshing = ref(false)
const commentSort = ref<'latest' | 'hot'>('latest')
const pinnedId = ref('comment-2')
let stopPolling: (() => void) | undefined

const comments = ref([
  {
    id: 'comment-1',
    author: '图书馆常客',
    content: '乐队返场一定要有，去年现场氛围特别好。',
    time: '5 分钟前',
    likes: 24,
  },
  {
    id: 'comment-2',
    author: '校庆志愿者',
    content: '楼主说得对，建议把最终节目单和投票结果一起公布。',
    time: '18 分钟前',
    likes: 41,
  },
  {
    id: 'comment-3',
    author: '匿名同学',
    content: '如果能加一个社团联合舞台就更好了。',
    time: '32 分钟前',
    likes: 13,
  },
])

const sortedComments = computed(() => {
  const list = [...comments.value]
  if (commentSort.value === 'hot') list.sort((a, b) => b.likes - a.likes)
  return list.sort((a, b) => Number(b.id === pinnedId.value) - Number(a.id === pinnedId.value))
})

const optionsWithPercent = computed(() => {
  if (!poll.value) return []
  const total = Math.max(
    poll.value.totalVotes,
    poll.value.options.reduce((sum, option) => sum + option.votes, 0),
  )
  return poll.value.options.map((option) => ({
    ...option,
    percent: total ? Math.round((option.votes / total) * 100) : 0,
  }))
})

const topOptionId = computed(
  () => [...optionsWithPercent.value].sort((a, b) => b.votes - a.votes)[0]?.id || '',
)

const turnout = computed(() => {
  if (!poll.value) return 0
  return Math.min(100, Math.round((poll.value.totalVotes / 400) * 100))
})

const deadlineText = computed(() => {
  if (!poll.value) return ''
  if (poll.value.ended) return '投票已结束'
  if (poll.value.remainingHours <= 24) return `剩余 ${poll.value.remainingHours} 小时`
  return `剩余 ${Math.ceil(poll.value.remainingHours / 24)} 天`
})

const canSubmit = computed(() => {
  if (!poll.value || poll.value.ended || poll.value.hasVoted) return false
  return poll.value.multiple ? selectedIds.value.length > 0 : selectedIds.value.length === 1
})

function haptic() {
  if ('vibrate' in navigator) navigator.vibrate(10)
}

function applyServerVote(nextVote: VoteData) {
  poll.value = nextVote
  selectedIds.value = nextVote.myOptionIds || []
}

async function manualRefresh() {
  if (!poll.value || refreshing.value) return
  refreshing.value = true
  try {
    if (VOTE_API_ENABLED) {
      const result = await fetchVoteResults(poll.value.id)
      applyServerVote(result.vote)
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 450))
    }
  } catch {
    // Keep the last known result and let the next polling cycle retry.
  } finally {
    refreshing.value = false
  }
}

function chooseOption(optionId: string) {
  if (!poll.value || poll.value.ended || poll.value.hasVoted) return
  haptic()

  if (poll.value.multiple) {
    selectedIds.value = selectedIds.value.includes(optionId)
      ? selectedIds.value.filter((id) => id !== optionId)
      : [...selectedIds.value, optionId]
    return
  }

  selectedIds.value = [optionId]
  submitVote()
}

function submitVote() {
  if (!poll.value || !canSubmit.value || submitting.value) return
  submitting.value = true

  // Optimistic result. Replace this block with API response and rollback on failure.
  poll.value.options = poll.value.options.map((option) =>
    selectedIds.value.includes(option.id) ? { ...option, votes: option.votes + 1 } : option,
  )
  poll.value.totalVotes += 1
  poll.value.myOptionIds = [...selectedIds.value]
  poll.value.hasVoted = true
  justVoted.value = true
  showConfetti.value = true

  window.setTimeout(() => {
    submitting.value = false
    justVoted.value = false
  }, 750)
  window.setTimeout(() => {
    showConfetti.value = false
  }, 1_800)
}

function togglePin(id: string) {
  pinnedId.value = pinnedId.value === id ? '' : id
}

async function sharePoll() {
  const payload = {
    title: poll.value?.title || post?.title || '校园投票',
    text: '来商砖小站投一票',
    url: window.location.href,
  }
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share(payload)
      return
    }
    await navigator.clipboard?.writeText(window.location.href)
  } catch {
    // User cancelled or clipboard permission was denied.
  }
}

onMounted(() => {
  if (!VOTE_API_ENABLED || !poll.value || poll.value.ended) return
  stopPolling = startVotePolling(poll.value.id, applyServerVote)
})

onBeforeUnmount(() => {
  stopPolling?.()
})
</script>

<template>
  <div class="page-scroll space-y-3 animate-fade-up">
    <template v-if="post && poll">
      <section
        class="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-600 via-brand-500 to-forum px-5 py-5 text-white shadow-[0_14px_34px_rgba(43,90,237,.22)]"
      >
        <div class="relative flex items-center gap-2">
          <span class="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
            <Vote :size="13" />
            事件投票
          </span>
          <span class="rounded-full bg-white/12 px-2.5 py-1 text-[11px]">
            {{ poll.multiple ? '多选' : '单选' }}
          </span>
          <span class="ml-auto text-[11px] text-white/70">{{ post.time }}</span>
        </div>
        <h1 class="relative mt-4 text-xl font-bold leading-8">{{ poll.title }}</h1>

        <div class="relative mt-5 flex items-center gap-5">
          <div
            class="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
            :style="{
              background: `conic-gradient(#ffffff 0 ${turnout}%, rgba(255,255,255,.18) ${turnout}% 100%)`,
            }"
          >
            <div class="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-brand-600/90">
              <span class="text-2xl font-bold">{{ poll.totalVotes }}</span>
              <span class="text-[10px] text-white/65">人已参与</span>
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 text-sm font-semibold">
              <Clock3 :size="16" />
              {{ deadlineText }}
            </p>
            <p class="mt-2 text-xs leading-5 text-white/68">
              {{ poll.anonymous ? '匿名投票，结果实时更新' : '公开投票者，投票后展示昵称和头像' }}
            </p>
            <button
              type="button"
              class="focus-ring pressable mt-2 inline-flex min-h-8 items-center gap-1 rounded-full bg-white/10 px-2.5 text-[11px] text-white/65 ring-1 ring-white/10"
              @click="manualRefresh"
            >
              <RefreshCw :size="12" :class="refreshing ? 'animate-spin' : ''" />
              每 10 秒自动更新 · 点此刷新
            </button>
          </div>
        </div>
      </section>

      <BaseCard>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold text-ink">
              {{ poll.hasVoted ? '投票结果' : '选择一个选项' }}
            </h2>
            <p class="mt-1 text-xs text-muted">
              {{ poll.multiple ? '可以选择多个选项，确认后提交' : '单选投票点击后立即提交' }}
            </p>
          </div>
          <span v-if="justVoted" class="flex items-center gap-1 text-xs font-medium text-campus">
            <Check :size="15" />
            已记录
          </span>
        </div>

        <div class="mt-4 space-y-3">
          <button
            v-for="option in optionsWithPercent"
            :key="option.id"
            type="button"
            class="focus-ring block w-full rounded-inner border p-3 text-left transition-all duration-500"
            :class="
              poll.hasVoted || poll.ended
                ? 'border-line bg-slate-50'
                : selectedIds.includes(option.id)
                  ? 'border-brand-400 bg-brand-50 shadow-[0_6px_18px_rgba(43,90,237,.1)]'
                  : 'border-line bg-white hover:border-brand-200'
            "
            :disabled="poll.hasVoted || poll.ended"
            @click="chooseOption(option.id)"
          >
            <div class="flex items-center gap-3">
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
                :class="
                  selectedIds.includes(option.id)
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-line bg-white text-muted'
                "
              >
                <Check v-if="selectedIds.includes(option.id)" :size="15" :stroke-width="3" />
                <span v-else>{{ option.label.slice(0, 1) }}</span>
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {{ option.label }}
                  </span>
                  <span v-if="poll.hasVoted || poll.ended" class="text-xs font-semibold text-muted">
                    {{ option.percent }}%
                  </span>
                </div>
                <div
                  v-if="poll.hasVoted || poll.ended"
                  class="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
                >
                  <div
                    class="h-full rounded-full transition-all duration-700 ease-out"
                    :class="
                      option.id === topOptionId
                        ? 'bg-gradient-to-r from-brand-500 to-forum'
                        : 'bg-brand-300'
                    "
                    :style="{ width: `${option.percent}%` }"
                  />
                </div>
                <p v-if="poll.hasVoted || poll.ended" class="mt-1 text-[10px] text-faint">
                  {{ option.votes }} 票
                </p>
              </div>
            </div>
          </button>
        </div>

        <BaseButton
          v-if="poll.multiple && !poll.hasVoted && !poll.ended"
          class="mt-4"
          block
          :disabled="!canSubmit"
          :loading="submitting"
          @click="submitVote"
        >
          确认投票
        </BaseButton>

        <div v-if="poll.ended" class="mt-4 rounded-inner bg-slate-100 px-3 py-2.5 text-center text-xs text-muted">
          投票已结束，结果仅供查看
        </div>
      </BaseCard>

      <BaseCard>
        <div class="flex items-center gap-2">
          <MessageCircle :size="17" class="text-brand-500" />
          <h2 class="text-sm font-semibold text-ink">讨论 {{ comments.length }}</h2>
          <div class="ml-auto flex rounded-full bg-slate-100 p-1">
            <button
              type="button"
              class="min-h-8 rounded-full px-3 text-[11px] font-medium"
              :class="commentSort === 'latest' ? 'bg-white text-brand-600 shadow-sm' : 'text-muted'"
              @click="commentSort = 'latest'"
            >
              最新
            </button>
            <button
              type="button"
              class="min-h-8 rounded-full px-3 text-[11px] font-medium"
              :class="commentSort === 'hot' ? 'bg-white text-brand-600 shadow-sm' : 'text-muted'"
              @click="commentSort = 'hot'"
            >
              最热
            </button>
          </div>
        </div>

        <div class="mt-3 divide-y divide-line/70">
          <article
            v-for="comment in sortedComments"
            :key="comment.id"
            class="py-3 first:pt-1 last:pb-0"
          >
            <div v-if="pinnedId === comment.id" class="mb-2 flex items-center gap-1 text-[11px] font-medium text-brand-600">
              <Pin :size="13" fill="currentColor" />
              楼主置顶
            </div>
            <div class="flex items-start gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forumSoft text-xs font-semibold text-forum">
                {{ comment.author.slice(0, 1) }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-ink">{{ comment.author }}</span>
                  <span class="text-[10px] text-faint">{{ comment.time }}</span>
                </div>
                <p class="mt-1.5 text-sm leading-6 text-slate-600">{{ comment.content }}</p>
                <div class="mt-2 flex items-center gap-3 text-[11px] text-faint">
                  <button type="button" class="flex min-h-8 items-center gap-1">
                    <ThumbsUp :size="13" />
                    {{ comment.likes }}
                  </button>
                  <button
                    type="button"
                    class="flex min-h-8 items-center gap-1 text-brand-600"
                    @click="togglePin(comment.id)"
                  >
                    <Pin :size="13" />
                    {{ pinnedId === comment.id ? '取消置顶' : '置顶评论' }}
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </BaseCard>

      <button
        type="button"
        class="focus-ring pressable sticky bottom-3 z-20 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-forum text-sm font-semibold text-white shadow-float"
        @click="sharePoll"
      >
        <Share2 :size="18" />
        邀请同学来投票
      </button>

      <div v-if="showConfetti" class="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden="true">
        <span
          v-for="index in 16"
          :key="index"
          class="confetti-piece"
          :style="{
            left: `${6 + (index * 6) % 88}%`,
            '--delay': `${(index % 6) * 70}ms`,
            '--drift': `${index % 2 ? 28 : -24}px`,
            '--color': index % 3 === 0 ? '#2B5AED' : index % 3 === 1 ? '#7357FF' : '#19A66A',
          }"
        />
      </div>
    </template>

    <template v-else>
      <BaseCard>
        <div class="flex items-center gap-2">
          <Vote :size="18" class="text-brand-500" />
          <span class="text-sm font-semibold text-ink">普通帖子</span>
        </div>
        <h1 class="mt-3 text-lg font-semibold text-ink">{{ post?.title || '帖子不存在' }}</h1>
        <p class="mt-3 text-sm leading-6 text-muted">
          {{ post?.excerpt || '这条内容暂时无法查看，返回论坛继续浏览其他讨论。' }}
        </p>
      </BaseCard>
      <EmptyState
        v-if="!post"
        title="没有找到这条帖子"
        description="它可能已被作者删除或暂停展示。"
      />
    </template>
  </div>
</template>

<style scoped>
.confetti-piece {
  position: absolute;
  top: -12px;
  width: 7px;
  height: 14px;
  border-radius: 2px;
  background: var(--color);
  animation: confetti-fall 1.65s cubic-bezier(0.16, 0.8, 0.36, 1) var(--delay) both;
}

@keyframes confetti-fall {
  0% {
    opacity: 0;
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
  12% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--drift), 760px, 0) rotate(520deg);
  }
}
</style>
