<script setup lang="ts">
import { Navigation, MapPin } from 'lucide-vue-next'
import type { CampusPlace } from '@/types'

defineProps<{
  places: CampusPlace[]
  selectedId?: string
}>()

const emit = defineEmits<{
  select: [place: CampusPlace]
}>()
</script>

<template>
  <div
    class="relative h-48 overflow-hidden rounded-card border border-white bg-[#dcebd9] shadow-card"
  >
    <img
      src="/campus-map.svg"
      alt="校园地图缩略图"
      class="absolute inset-0 h-full w-full object-cover"
    />
    <button
      v-for="(place, index) in places"
      :key="place.id"
      type="button"
      class="focus-ring absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-white transition active:scale-90"
      :class="selectedId === place.id ? 'ring-4' : 'ring-2'"
      :style="{ left: `${place.x}%`, top: `${place.y}%` }"
      :aria-label="`查看${place.name}`"
      @click="emit('select', place)"
    >
      <span
        class="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg"
        :class="index % 2 ? 'bg-market' : 'bg-brand-500'"
      >
        <MapPin :size="17" fill="currentColor" />
      </span>
    </button>
    <div
      class="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-inner bg-white/90 px-3 py-2 text-xs text-muted shadow-card backdrop-blur"
    >
      <Navigation :size="15" class="text-brand-500" />
      <span>点击标记查看地点，再选择到达方式</span>
    </div>
  </div>
</template>

