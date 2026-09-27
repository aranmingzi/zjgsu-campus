<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    block?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    block: false,
  },
)

const variantClasses = {
  primary:
    'bg-brand-500 text-white shadow-[0_6px_16px_rgba(43,90,237,.18)] hover:bg-brand-600',
  secondary:
    'bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-100',
  ghost: 'bg-transparent text-muted hover:bg-slate-100',
  danger: 'bg-dangerSoft text-danger hover:bg-red-100',
  dark: 'bg-slate-900 text-white hover:bg-slate-800',
}

const sizeClasses = {
  sm: 'min-h-11 px-4 text-sm',
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-12 px-6 text-base',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="focus-ring pressable inline-flex items-center justify-center gap-2 rounded-full font-semibold disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
    :class="[
      variantClasses[variant],
      sizeClasses[size],
      block ? 'w-full' : '',
    ]"
  >
    <LoaderCircle v-if="loading" :size="18" class="animate-spin" aria-hidden="true" />
    <slot />
  </button>
</template>

