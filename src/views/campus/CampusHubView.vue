<script setup lang="ts">
import { ref } from 'vue'
import {
  CalendarDays,
  ChevronRight,
  MapPinned,
  Megaphone,
  UsersRound,
} from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'
import CampusCalendar from '@/components/campus/CampusCalendar.vue'
import CampusPlaces from '@/components/campus/CampusPlaces.vue'
import { events } from '@/data/mock'

type Tab = 'events' | 'calendar' | 'places'
const tab = ref<Tab>('events')

const tabs = [
  { key: 'events' as const, label: '活动信息', icon: Megaphone },
  { key: 'calendar' as const, label: '校历', icon: CalendarDays },
  { key: 'places' as const, label: '地点地图', icon: MapPinned },
]
</script>

<template>
  <div class="page-scroll animate-fade-up">
    <div class="mb-4 grid grid-cols-3 rounded-card border border-white bg-white p-1 shadow-card">
      <button
        v-for="item in tabs"
        :key="item.key"
        type="button"
        class="focus-ring flex min-h-11 flex-col items-center justify-center gap-1 rounded-inner text-[11px] font-medium transition"
        :class="
          tab === item.key
            ? 'bg-campusSoft text-campus'
            : 'text-muted hover:bg-slate-50'
        "
        @click="tab = item.key"
      >
        <component :is="item.icon" :size="17" />
        {{ item.label }}
      </button>
    </div>

    <template v-if="tab === 'events'">
      <BaseCard class="mb-3 border-campus/10 bg-gradient-to-r from-campusSoft to-white shadow-none">
        <div class="flex items-center gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-inner bg-white text-campus shadow-sm">
            <Megaphone :size="20" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-ink">有活动想发起？</p>
            <p class="mt-1 text-xs text-muted">讲座、比赛和组队都可以发布</p>
          </div>
          <RouterLink to="/campus/add" class="text-xs font-semibold text-campus">
            发布
          </RouterLink>
        </div>
      </BaseCard>

      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-ink">近期活动</h2>
        <span class="text-xs text-faint">官网 · 同学发起</span>
      </div>

      <div class="space-y-3">
        <RouterLink
          v-for="event in events"
          :key="event.id"
          :to="`/campus/event/${event.id}`"
          class="block"
        >
          <BaseCard clickable>
            <div class="flex items-center gap-2">
              <span
                class="rounded-full px-2.5 py-1 text-[11px] font-medium"
                :class="
                  event.type === 'official'
                    ? 'bg-brand-50 text-brand-600'
                    : 'bg-campusSoft text-campus'
                "
              >
                {{ event.type === 'official' ? '学校官网' : '同学发起' }}
              </span>
              <span class="ml-auto text-[11px] text-faint">{{ event.date }}</span>
            </div>
            <h3 class="mt-3 text-[15px] font-semibold leading-6 text-ink">{{ event.title }}</h3>
            <div class="mt-3 grid grid-cols-[1fr_auto] gap-3 text-xs text-muted">
              <span class="truncate">{{ event.location }} · {{ event.organizer }}</span>
              <span class="flex items-center gap-1">
                <UsersRound :size="14" />
                {{ event.participants }}
              </span>
            </div>
            <div class="mt-3 flex items-center border-t border-line/70 pt-3 text-xs font-medium text-campus">
              查看详情
              <ChevronRight :size="15" />
            </div>
          </BaseCard>
        </RouterLink>
      </div>
    </template>

    <CampusCalendar v-else-if="tab === 'calendar'" />
    <CampusPlaces v-else />
  </div>
</template>

