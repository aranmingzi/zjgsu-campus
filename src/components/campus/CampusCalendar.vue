<script setup lang="ts">
import { CalendarClock, CheckCircle2, Clock3 } from 'lucide-vue-next'
import { calendarItems } from '@/data/mock'
</script>

<template>
  <section>
    <div
      class="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-600 via-brand-500 to-[#4786f5] px-5 py-5 text-white shadow-[0_12px_28px_rgba(43,90,237,.22)]"
    >
      <div class="flex items-center gap-2 text-xs text-white/75">
        <CalendarClock :size="15" />
        最近一个节点
      </div>
      <div class="mt-3 flex items-end gap-3">
        <span class="text-4xl font-bold leading-none">{{ calendarItems[0]?.days }}</span>
        <span class="pb-0.5 text-sm text-white/75">天后</span>
      </div>
      <p class="mt-2 text-sm font-semibold">{{ calendarItems[0]?.name }}</p>
      <span class="mt-3 inline-flex items-center gap-1 rounded-full bg-white/12 px-3 py-1 text-[11px]">
        <Clock3 :size="12" />
        {{ calendarItems[0]?.date }}
      </span>
    </div>

    <div class="relative mt-4 pl-5">
      <div class="absolute bottom-4 left-[7px] top-3 w-px bg-gradient-to-b from-campus via-brand-200 to-line" />
      <article
        v-for="item in calendarItems"
        :key="item.id"
        class="relative mb-3 last:mb-0"
      >
        <span
          class="absolute -left-5 top-5 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-campus shadow-sm ring-1 ring-campus/20"
        />
        <div class="rounded-card border border-white bg-white p-4 shadow-card">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-ink">{{ item.name }}</p>
              <p class="mt-1.5 text-xs text-muted">{{ item.date }}</p>
              <p class="mt-1 text-xs leading-5 text-faint">{{ item.note }}</p>
            </div>
            <span class="shrink-0 rounded-full bg-campusSoft px-3 py-1 text-xs font-semibold text-campus">
              {{ item.days }} 天
            </span>
          </div>
          <div class="mt-3 flex items-center gap-1.5 border-t border-line/70 pt-3 text-[11px] text-faint">
            <CheckCircle2 :size="13" />
            日期以学校正式通知为准
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

