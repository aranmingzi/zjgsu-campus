<script setup lang="ts">
import { Camera } from 'lucide-vue-next'

defineProps<{
  name: string
}>()
</script>

<template>
  <button
    type="button"
    class="focus-ring group relative h-24 w-24 rounded-full ring-4 ring-white transition active:scale-95"
    aria-label="编辑头像"
  >
    <span
      class="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-brand-500 via-brand-400 to-cyan-400 text-3xl font-bold text-white shadow-float"
    >
      {{ name.slice(0, 1) }}
    </span>
    <span
      class="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-ink text-white shadow-lg"
    >
      <Camera :size="16" />
    </span>
  </button>
</template>

