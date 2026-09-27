<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, CircleDashed, Sparkles, Star } from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'

const props = withDefaults(
  defineProps<{
    courseName: string
    score: number | null
    tags?: string[]
    reviewsCount: number
    college?: string
    major?: string
    credit?: number
    goodRate?: number | null
    to?: string
  }>(),
  {
    tags: () => [],
    college: '',
    major: '',
    credit: 0,
    goodRate: null,
    to: '',
  },
)

const emit = defineEmits<{
  select: []
}>()

const hasReviewData = computed(
  () => props.score !== null && props.reviewsCount > 0,
)

const detailText = computed(() =>
  [props.college, props.major, props.credit ? `${props.credit} 学分` : '']
    .filter(Boolean)
    .join(' · '),
)

const colorClasses = [
  'bg-brand-500',
  'bg-forum',
  'bg-market',
  'bg-campus',
  'bg-cyan-500',
  'bg-rose-500',
]

const initialColor = computed(
  () => colorClasses[props.courseName.codePointAt(0)! % colorClasses.length],
)
</script>

<template>
  <RouterLink
    v-if="to"
    :to="to"
    class="block"
  >
    <BaseCard clickable>
      <div class="flex items-start gap-3.5">
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-inner text-lg font-bold text-white shadow-sm"
          :class="initialColor"
        >
          {{ courseName.slice(0, 1) }}
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="truncate text-base font-semibold text-ink">{{ courseName }}</h2>
              <p v-if="detailText" class="mt-1 truncate text-xs text-muted">
                {{ detailText }}
              </p>
            </div>

            <div
              v-if="hasReviewData"
              class="shrink-0 rounded-inner bg-amber-50 px-2.5 py-1 text-right text-amber-600"
            >
              <span class="text-base font-bold">{{ score?.toFixed(1) }}</span>
              <span class="ml-0.5 text-[10px]">分</span>
            </div>
            <span
              v-else
              class="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-faint"
            >
              暂无评分
            </span>
          </div>

          <div v-if="hasReviewData" class="mt-3 flex flex-wrap gap-5">
            <span class="flex items-center gap-1 text-xs text-amber-500">
              <Star :size="14" fill="currentColor" />
              好评率 {{ goodRate ?? 0 }}%
            </span>
            <span class="text-xs text-muted">{{ reviewsCount }} 条评价</span>
          </div>

          <div
            v-else
            class="mt-3 flex items-center gap-2 rounded-inner bg-slate-50 px-3 py-2.5 text-xs text-muted"
          >
            <CircleDashed :size="16" class="shrink-0 text-faint" />
            还没有评价，来做第一个分享体验的人
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <template v-if="tags.length">
              <span
                v-for="tag in tags.slice(0, 3)"
                :key="tag"
                class="rounded-full px-2.5 py-1 text-[11px] font-medium"
                :class="
                  tag.includes('给分') || tag.includes('强推')
                    ? 'bg-campusSoft text-campus'
                    : 'bg-brand-50 text-brand-600'
                "
              >
                {{ tag }}
              </span>
            </template>
            <span v-else class="flex items-center gap-1 text-[11px] text-faint">
              <Sparkles :size="13" />
              暂无评价标签
            </span>
          </div>
        </div>

        <ChevronRight :size="18" class="mt-1 shrink-0 text-faint" />
      </div>
    </BaseCard>
  </RouterLink>

  <BaseCard v-else @click="emit('select')">
    <div class="flex items-center gap-3">
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-inner text-base font-bold text-white"
        :class="initialColor"
      >
        {{ courseName.slice(0, 1) }}
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-sm font-semibold text-ink">{{ courseName }}</h2>
        <p class="mt-1 text-xs text-muted">
          {{ hasReviewData ? `${score?.toFixed(1)} 分 · ${reviewsCount} 条评价` : '暂无评分' }}
        </p>
      </div>
      <ChevronRight :size="18" class="text-faint" />
    </div>
  </BaseCard>
</template>
