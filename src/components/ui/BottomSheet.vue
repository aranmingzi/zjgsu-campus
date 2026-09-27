<script setup lang="ts">
import { X } from 'lucide-vue-next'
import IconButton from './IconButton.vue'

defineProps<{
  open: boolean
  title?: string
  description?: string
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/35 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        @click.self="emit('close')"
      >
        <Transition
          appear
          enter-active-class="transition duration-250 ease-out"
          enter-from-class="translate-y-full"
          leave-active-class="transition duration-200 ease-in"
          leave-to-class="translate-y-full"
        >
          <section
            class="safe-bottom w-full max-w-[430px] rounded-t-[24px] bg-white px-5 pb-5 pt-3 shadow-sheet"
          >
            <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
            <div class="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 v-if="title" class="text-base font-semibold text-ink">{{ title }}</h2>
                <p v-if="description" class="mt-1 text-xs leading-5 text-muted">
                  {{ description }}
                </p>
              </div>
              <IconButton label="关闭" variant="plain" @click="emit('close')">
                <X :size="20" />
              </IconButton>
            </div>
            <slot />
          </section>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

