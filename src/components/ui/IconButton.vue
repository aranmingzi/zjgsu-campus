<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    disabled?: boolean
    variant?: 'light' | 'glass' | 'plain'
  }>(),
  {
    disabled: false,
    variant: 'light',
  },
)

const variants = {
  light: 'bg-white text-ink shadow-card hover:bg-slate-50',
  glass: 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15',
  plain: 'bg-transparent text-muted hover:bg-slate-100',
}
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :disabled="disabled"
    class="focus-ring pressable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
    :class="variants[variant]"
  >
    <slot />
  </button>
</template>

