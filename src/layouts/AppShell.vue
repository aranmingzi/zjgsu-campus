<script setup lang="ts">
import { computed } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/ui/AppHeader.vue'
import BottomNav from '@/components/ui/BottomNav.vue'

const route = useRoute()
const darkHeader = computed(() => Boolean(route.meta.darkHeader))
const backgroundClass = computed(() =>
  route.meta.darkHeader ? 'bg-[#0d1026]' : 'bg-canvas',
)
</script>

<template>
  <div
    class="relative flex h-full min-h-0 flex-col overflow-hidden bg-white"
    :data-route="route.path"
  >
    <AppHeader
      :title="route.meta.title || '商砖小站'"
      :show-back="Boolean(route.meta.showBack)"
      :dark="darkHeader"
    />
    <main
      class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
      :class="backgroundClass"
    >
      <slot />
    </main>
    <RouterLink
      v-if="route.meta.fab"
      :to="route.meta.fab.to"
      class="focus-ring pressable absolute right-4 z-30 flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-brand-500/80 px-3.5 text-xs font-semibold text-white shadow-[0_8px_22px_rgba(43,90,237,.18)] backdrop-blur-md transition hover:bg-brand-500/95"
      :class="route.meta.isTab ? 'bottom-[82px]' : 'bottom-4'"
    >
      <Plus :size="16" :stroke-width="2.4" />
      {{ route.meta.fab.label }}
    </RouterLink>
    <BottomNav v-if="route.meta.isTab" />
  </div>
</template>
