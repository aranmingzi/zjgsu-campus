<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronLeft, MoreHorizontal } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import IconButton from './IconButton.vue'

const props = withDefaults(
  defineProps<{
    title: string
    showBack?: boolean
    dark?: boolean
  }>(),
  {
    showBack: false,
    dark: false,
  },
)

const router = useRouter()
const now = ref('')
let timer: number | undefined

function syncTime() {
  now.value = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.push('/course')
}

onMounted(() => {
  syncTime()
  timer = window.setInterval(syncTime, 30_000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const textClass = computed(() => (props.dark ? 'text-white' : 'text-ink'))
</script>

<template>
  <header
    class="relative z-30 shrink-0 border-b"
    :class="dark ? 'border-white/10 bg-[#11142e]' : 'border-line/70 bg-white/95 backdrop-blur-xl'"
  >
    <div
      class="flex h-6 items-center justify-between px-5 text-[11px] font-semibold"
      :class="textClass"
    >
      <span>{{ now || '09:41' }}</span>
      <div class="flex items-center gap-1.5" aria-hidden="true">
        <span class="tracking-[-1px]">▮▮▮</span>
        <span>5G</span>
        <span class="inline-block h-2.5 w-5 rounded-[3px] border border-current p-px">
          <span class="block h-full w-3/4 rounded-[1px] bg-current" />
        </span>
      </div>
    </div>
    <div class="grid h-12 grid-cols-[44px_1fr_44px] items-center px-3">
      <div>
        <IconButton
          v-if="showBack"
          label="返回"
          :variant="dark ? 'glass' : 'plain'"
          @click="goBack"
        >
          <ChevronLeft :size="22" />
        </IconButton>
      </div>
      <h1 class="truncate text-center text-base font-semibold" :class="textClass">
        {{ title }}
      </h1>
      <div class="flex justify-end">
        <IconButton
          label="更多"
          :variant="dark ? 'glass' : 'plain'"
          @click="$emit('more')"
        >
          <MoreHorizontal :size="20" />
        </IconButton>
      </div>
    </div>
  </header>
</template>

