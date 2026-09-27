<script setup lang="ts" generic="T extends string | number">
defineProps<{
  items: readonly T[]
  modelValue: T
  labels?: Record<string, string>
  accent?: 'brand' | 'forum' | 'market' | 'campus'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()

const accents = {
  brand: 'border-brand-500 bg-brand-500 text-white shadow-[0_4px_12px_rgba(43,90,237,.18)]',
  forum: 'border-forum bg-forum text-white shadow-[0_4px_12px_rgba(115,87,255,.2)]',
  market: 'border-market bg-market text-white shadow-[0_4px_12px_rgba(245,138,50,.2)]',
  campus: 'border-campus bg-campus text-white shadow-[0_4px_12px_rgba(25,166,106,.2)]',
}
</script>

<template>
  <div class="no-scrollbar flex gap-2 overflow-x-auto pb-1">
    <button
      v-for="item in items"
      :key="String(item)"
      type="button"
      class="focus-ring min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition duration-150 active:scale-[0.96]"
      :class="
        item === modelValue
          ? [accents[accent || 'brand'], 'animate-pill-pop']
          : 'border-line bg-white text-muted hover:border-slate-300'
      "
      @click="emit('update:modelValue', item)"
    >
      <slot :item="item">{{ labels?.[String(item)] || item }}</slot>
    </button>
  </div>
</template>

