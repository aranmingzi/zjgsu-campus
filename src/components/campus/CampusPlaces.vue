<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  BusFront,
  ChevronRight,
  Footprints,
  MapPin,
  Phone,
  Route,
} from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import MapPreview from '@/components/ui/MapPreview.vue'
import { BUS_PHONE } from '@/config/app'
import { places } from '@/data/mock'
import type { CampusPlace } from '@/types'

const selectedPlace = ref<CampusPlace>(places[0])
const sheetOpen = ref(false)
const actionMessage = ref('')

const placesWithSelection = computed(() =>
  places.map((place) => ({ ...place, selected: place.id === selectedPlace.value.id })),
)

function openPlace(place: CampusPlace) {
  selectedPlace.value = place
  actionMessage.value = ''
  sheetOpen.value = true
}

function updateSelection(place: CampusPlace) {
  openPlace(place)
}

function startWalking() {
  actionMessage.value = `已选择步行前往「${selectedPlace.value.name}」，小程序接入后将调用微信内置地图。`
  sheetOpen.value = false
}

function callBus() {
  actionMessage.value = BUS_PHONE
    ? `正在呼叫校车服务：${BUS_PHONE}`
    : '校车热线尚未配置，可在 utils/config.js 中填写 BUS_PHONE。'
  sheetOpen.value = false
}
</script>

<template>
  <section class="space-y-3">
    <MapPreview
      :places="places"
      :selected-id="selectedPlace.id"
      @select="updateSelection"
    />

    <div
      v-if="actionMessage"
      class="rounded-inner border border-brand-100 bg-brand-50 px-3 py-2.5 text-xs leading-5 text-brand-700"
    >
      {{ actionMessage }}
    </div>

    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-sm font-semibold text-ink">常用地点</h2>
        <p class="mt-1 text-xs text-muted">点击导航会选择到达方式</p>
      </div>
      <span class="text-xs text-faint">{{ places.length }} 个地点</span>
    </div>

    <button
      v-for="place in placesWithSelection"
      :key="place.id"
      type="button"
      class="block w-full text-left"
      @click="openPlace(place)"
    >
      <BaseCard clickable>
        <div class="flex items-center gap-3">
          <span
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-inner"
            :class="place.selected ? 'bg-campus text-white' : 'bg-campusSoft text-campus'"
          >
            <MapPin :size="20" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="truncate text-sm font-semibold text-ink">{{ place.name }}</h3>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-muted">
                {{ place.category }}
              </span>
            </div>
            <p class="mt-1 truncate text-xs text-muted">{{ place.description }}</p>
          </div>
          <span class="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-500">
            导航
            <ChevronRight :size="15" />
          </span>
        </div>
      </BaseCard>
    </button>

    <BottomSheet
      :open="sheetOpen"
      :title="`前往 ${selectedPlace.name}`"
      :description="selectedPlace.description"
      @close="sheetOpen = false"
    >
      <div class="space-y-2">
        <button
          type="button"
          class="focus-ring pressable flex min-h-14 w-full items-center gap-3 rounded-inner border border-line px-4 text-left transition hover:border-brand-200 hover:bg-brand-50"
          @click="startWalking"
        >
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <Footprints :size="20" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-ink">步行路线</span>
            <span class="mt-0.5 block text-xs text-muted">打开微信内置地图查看步行路径</span>
          </span>
          <Route :size="18" class="text-faint" />
        </button>

        <button
          type="button"
          class="focus-ring pressable flex min-h-14 w-full items-center gap-3 rounded-inner border border-line px-4 text-left transition hover:border-campus/30 hover:bg-campusSoft"
          @click="callBus"
        >
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-campusSoft text-campus">
            <BusFront :size="20" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-ink">呼叫校车</span>
            <span class="mt-0.5 block text-xs text-muted">
              {{ BUS_PHONE || '校车热线待配置' }}
            </span>
          </span>
          <Phone :size="18" class="text-faint" />
        </button>
      </div>
      <BaseButton class="mt-3" block variant="ghost" @click="sheetOpen = false">取消</BaseButton>
    </BottomSheet>
  </section>
</template>
