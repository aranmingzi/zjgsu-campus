<script setup lang="ts">
import { ChevronRight, ShieldCheck } from 'lucide-vue-next'
import TreeHoleIcon from './TreeHoleIcon.vue'

withDefaults(
  defineProps<{
    iconVariant?: 'night-light' | 'animal' | 'cloud-moon'
  }>(),
  {
    iconVariant: 'night-light',
  },
)
</script>

<template>
  <RouterLink
    to="/forum/hole"
    class="treehole-entry focus-ring group relative block overflow-hidden rounded-card border border-white/15 p-4 text-white transition duration-200 active:scale-[0.975]"
  >
    <div class="relative z-10 flex items-center gap-3.5">
      <span
        class="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/20 bg-white/12 shadow-[0_8px_24px_rgba(46,22,94,.2)] backdrop-blur-sm"
      >
        <TreeHoleIcon :variant="iconVariant" class="h-12 w-12" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="block text-base font-semibold">匿名树洞</span>
        <span class="mt-1 block text-xs text-white/76">无人知晓你是谁，说说不敢说的</span>
      </span>

      <ChevronRight :size="20" class="shrink-0 text-white/65 transition-transform duration-200 group-active:translate-x-0.5" />
    </div>

    <span class="relative z-10 mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-white/62">
      <ShieldCheck :size="14" class="mt-0.5 shrink-0 text-amber-100" />
      头像、昵称和身份标识不会对其他同学展示；违规内容平台仍可追溯
    </span>
  </RouterLink>
</template>

<style scoped>
.treehole-entry {
  background:
    radial-gradient(circle at 82% 18%, rgba(255, 224, 163, 0.2), transparent 27%),
    radial-gradient(circle at 14% 82%, rgba(143, 104, 255, 0.3), transparent 31%),
    linear-gradient(135deg, #5a36c7 0%, #7654e9 52%, #9b58ea 100%);
  box-shadow: 0 12px 30px rgba(92, 60, 196, 0.24);
}

.treehole-entry::after {
  position: absolute;
  inset: 0;
  content: "";
  pointer-events: none;
  opacity: 0.44;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.9) 0 1px, transparent 1.4px),
    radial-gradient(circle, rgba(255, 222, 151, 0.65) 0 0.8px, transparent 1.3px);
  background-position:
    0 0,
    13px 17px;
  background-size:
    38px 38px,
    53px 53px;
  mask-image: linear-gradient(90deg, transparent, #000 22%, #000 84%, transparent);
}
</style>

