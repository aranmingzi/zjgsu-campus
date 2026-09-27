<script setup lang="ts">
import {
  BookOpenCheck,
  Building2,
  MessageCircleMore,
  ShoppingBag,
  UserRound,
} from 'lucide-vue-next'
import { useRoute } from 'vue-router'

const route = useRoute()

const items = [
  { label: '课程', path: '/course', icon: BookOpenCheck },
  { label: '论坛', path: '/forum', icon: MessageCircleMore },
  { label: '闲置', path: '/market', icon: ShoppingBag },
  { label: '校园', path: '/campus', icon: Building2 },
  { label: '我的', path: '/mine', icon: UserRound },
]
</script>

<template>
  <nav
    class="safe-bottom z-40 grid shrink-0 grid-cols-5 border-t border-line bg-white px-2 pt-1.5"
    aria-label="主导航"
  >
    <RouterLink
      v-for="item in items"
      :key="item.path"
      :to="item.path"
      class="focus-ring group flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium"
      :class="route.path === item.path ? 'text-brand-500' : 'text-faint'"
    >
      <span
        class="flex h-7 w-10 items-center justify-center rounded-full transition"
        :class="route.path === item.path ? 'bg-brand-50' : 'group-active:bg-slate-100'"
      >
        <component :is="item.icon" :size="20" :stroke-width="2" />
      </span>
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

