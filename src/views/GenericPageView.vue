<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, CircleDashed, FileText, Settings2 } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { genericRows } from '@/data/mock'

const route = useRoute()
const pageType = computed(() => route.meta.pageType || 'list')
const description = computed(
  () => route.meta.description || '业务数据接入后，这里会呈现完整内容和操作状态。',
)
</script>

<template>
  <div class="page-scroll animate-fade-up">
    <BaseCard class="mb-4 overflow-hidden bg-gradient-to-br from-white to-slate-50">
      <div class="flex items-start gap-3">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-inner bg-brand-50 text-brand-500"
        >
          <Settings2 v-if="pageType === 'settings'" :size="22" />
          <FileText v-else-if="pageType === 'form'" :size="22" />
          <CircleDashed v-else :size="22" />
        </span>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-ink">{{ route.meta.title }}</p>
          <p class="mt-1 text-xs leading-5 text-muted">{{ description }}</p>
        </div>
      </div>
    </BaseCard>

    <template v-if="pageType === 'form'">
      <BaseCard class="space-y-4">
        <label class="block">
          <span class="mb-2 block text-xs font-medium text-muted">标题</span>
          <input
            class="h-11 w-full rounded-inner border border-line bg-slate-50 px-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white"
            placeholder="一句话说清目的"
          />
        </label>
        <label class="block">
          <span class="mb-2 block text-xs font-medium text-muted">详细说明</span>
          <textarea
            class="min-h-32 w-full resize-none rounded-inner border border-line bg-slate-50 p-3 text-sm leading-6 outline-none transition focus:border-brand-400 focus:bg-white"
            placeholder="补充时间、地点、联系方式或注意事项"
          />
        </label>
        <BaseButton block>保存并预览</BaseButton>
      </BaseCard>
    </template>

    <template v-else-if="pageType === 'detail'">
      <BaseCard class="mb-4">
        <div class="h-2 w-14 rounded-full bg-brand-100" />
        <h2 class="mt-3 text-lg font-semibold text-ink">页面主信息</h2>
        <p class="mt-2 text-sm leading-6 text-muted">
          这里保留详情页的标题、元信息、正文和底部操作的完整层级。接入真实业务后可直接替换内容，不改变布局骨架。
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <span class="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-600">状态标签</span>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs text-muted">辅助信息</span>
        </div>
      </BaseCard>
      <BaseCard>
        <h3 class="text-sm font-semibold text-ink">详细内容</h3>
        <div class="mt-4 space-y-3">
          <p v-for="row in genericRows" :key="row.title" class="text-sm leading-6 text-slate-600">
            {{ row.description }}
          </p>
        </div>
      </BaseCard>
    </template>

    <template v-else-if="pageType === 'settings'">
      <BaseCard :padded="false" class="divide-y divide-line overflow-hidden">
        <button
          v-for="(row, index) in genericRows"
          :key="row.title"
          type="button"
          class="pressable flex min-h-16 w-full items-center gap-3 px-4 text-left"
        >
          <span class="flex h-9 w-9 items-center justify-center rounded-inner bg-slate-100 text-muted">
            {{ index + 1 }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-ink">{{ row.title }}</span>
            <span class="mt-0.5 block truncate text-xs text-muted">{{ row.description }}</span>
          </span>
          <ChevronRight :size="18" class="text-faint" />
        </button>
      </BaseCard>
    </template>

    <template v-else>
      <div class="space-y-3">
        <button
          v-for="row in genericRows"
          :key="row.title"
          type="button"
          class="block w-full text-left"
        >
          <BaseCard clickable>
            <div class="flex items-start gap-3">
              <span class="mt-1 h-10 w-1 rounded-full bg-brand-400" />
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-3">
                  <h2 class="text-sm font-semibold text-ink">{{ row.title }}</h2>
                  <span class="shrink-0 text-xs text-faint">{{ row.meta }}</span>
                </div>
                <p class="mt-1 text-xs leading-5 text-muted">{{ row.description }}</p>
              </div>
            </div>
          </BaseCard>
        </button>
      </div>
      <EmptyState
        class="mt-4 rounded-card border border-dashed border-line bg-white/60"
        title="更多内容将在下一阶段接入"
        description="当前页面只展示统一骨架，避免静态示例被误认为真实业务数据。"
      />
    </template>
  </div>
</template>
