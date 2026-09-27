<script setup lang="ts">
withDefaults(
  defineProps<{
    padded?: boolean
    clickable?: boolean
  }>(),
  {
    padded: true,
    clickable: false,
  },
)
</script>

<template>
  <div
    class="rounded-card border border-white/80 bg-white shadow-card"
    :class="[padded ? 'p-4' : '', clickable ? 'pressable cursor-pointer' : '']"
  >
    <slot />
  </div>
</template>

