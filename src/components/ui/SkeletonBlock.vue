<script setup lang="ts">
withDefaults(
  defineProps<{
    width?: string
    height?: string
    rounded?: string
  }>(),
  {
    width: '100%',
    height: '14px',
    rounded: '8px',
  },
)
</script>

<template>
  <div
    class="animate-pulse bg-slate-100"
    :style="{ width, height, borderRadius: rounded }"
    aria-hidden="true"
  />
</template>

