<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'

defineProps<{
  title: string
  description?: string
  actionLabel?: string
}>()

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="flex flex-col items-center px-8 py-12 text-center">
    <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-faint">
      <slot name="icon">
        <Inbox :size="26" />
      </slot>
    </div>
    <h3 class="text-sm font-semibold text-ink">{{ title }}</h3>
    <p v-if="description" class="mt-2 text-xs leading-5 text-muted">{{ description }}</p>
    <button
      v-if="actionLabel"
      type="button"
      class="focus-ring pressable mt-4 min-h-11 rounded-full bg-brand-50 px-5 text-sm font-semibold text-brand-600"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>

