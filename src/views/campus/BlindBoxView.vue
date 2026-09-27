<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Compass, Droplets, Sparkles, Waves } from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const fetching = ref(false)
const bottleVisible = ref(false)
const activeReaction = ref('')
let timer: number | undefined

const reactions = [
  { key: 'hug', emoji: '💖', label: '抱抱' },
  { key: 'tea', emoji: '🍵', label: '递茶' },
  { key: 'pat', emoji: '🐾', label: '摸摸头' },
]

function fetchBottle() {
  if (fetching.value) return
  fetching.value = true
  bottleVisible.value = false
  timer = window.setTimeout(() => {
    fetching.value = false
    bottleVisible.value = true
  }, 850)
}

onBeforeUnmount(() => {
  if (timer) window.clearTimeout(timer)
})
</script>

<template>
  <div
    class="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_50%_8%,rgba(92,76,185,.48),transparent_38%),radial-gradient(circle_at_88%_72%,rgba(32,92,180,.28),transparent_36%),linear-gradient(180deg,#0b1234_0%,#0d1026_48%,#080b1d_100%)] px-4 pb-16 pt-5 text-white"
  >
    <section class="relative z-10 text-center">
      <span
        class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-cyan-200 ring-1 ring-white/10"
      >
        <Waves :size="20" />
      </span>
      <h2 class="mt-3 text-xl font-bold">让心事漂一会儿</h2>
      <p class="mt-2 text-xs leading-5 text-white/55">
        每天可以捞 3 次，回复后解锁对方院系。自己扔出的瓶子不会回到手里。
      </p>
    </section>

    <section class="relative z-10 flex min-h-[360px] flex-col items-center justify-center py-8">
      <button
        type="button"
        class="focus-ring relative flex h-40 w-40 items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-300/10 shadow-[0_0_60px_rgba(74,196,255,.22)] transition active:scale-95"
        :disabled="fetching"
        @click="fetchBottle"
      >
        <span
          v-for="ring in 3"
          :key="ring"
          class="absolute inset-0 rounded-full border border-cyan-200/20"
          :class="fetching ? 'animate-ripple' : ''"
          :style="{ animationDelay: `${(ring - 1) * 180}ms` }"
        />
        <span
          class="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-brand-500 text-[#071333] shadow-[0_0_36px_rgba(94,206,255,.5)]"
        >
          <Droplets :size="28" />
          <span class="mt-1 text-sm font-bold">{{ fetching ? '撒网中…' : '捞一个树洞' }}</span>
        </span>
      </button>
      <p class="mt-4 flex items-center gap-1.5 text-xs text-white/45">
        <Compass :size="14" />
        今日剩余 3 次
      </p>
    </section>

    <BaseCard
      v-if="bottleVisible"
      class="relative z-10 animate-flip-in !border-white/12 !bg-white/[0.08] text-white shadow-none backdrop-blur"
    >
      <div class="flex items-center gap-2">
        <span class="rounded-full bg-cyan-300/15 px-2.5 py-1 text-[11px] text-cyan-100">
          匿名提问
        </span>
        <span class="ml-auto text-[11px] text-white/45">来自未解锁院系</span>
      </div>
      <p class="mt-4 text-base font-medium leading-7 text-white/92">
        刚进入大学，总觉得自己还没有找到真正擅长的事。你也有过这种阶段吗？
      </p>
      <textarea
        class="mt-4 min-h-24 w-full resize-none rounded-inner border border-white/10 bg-white/[0.07] p-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40"
        placeholder="回一句话，回复后解锁院系"
      />
      <div class="mt-3 grid grid-cols-3 gap-2">
        <button
          v-for="reaction in reactions"
          :key="reaction.key"
          type="button"
          class="min-h-11 rounded-inner border border-white/10 bg-white/[0.05] text-xs transition active:scale-95"
          :class="
            activeReaction === reaction.key
              ? 'border-cyan-200/40 bg-cyan-300/15 text-white'
              : 'text-white/65'
          "
          @click="activeReaction = reaction.key"
        >
          <span class="mr-1 text-base">{{ reaction.emoji }}</span>
          {{ reaction.label }}
        </button>
      </div>
      <BaseButton class="mt-4" block>回复并解锁</BaseButton>
    </BaseCard>

    <div class="relative z-10 mt-4 rounded-card border border-white/10 bg-white/[0.055] p-4">
      <div class="flex items-center gap-2">
        <Sparkles :size="17" class="text-violet-300" />
        <h3 class="text-sm font-semibold">往海里扔一个</h3>
      </div>
      <textarea
        class="mt-3 min-h-24 w-full resize-none rounded-inner border border-white/10 bg-white/[0.06] p-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-violet-300/40"
        placeholder="写一句匿名心事，500 字内"
      />
      <BaseButton class="mt-3" block>扔进海里</BaseButton>
      <p class="mt-3 text-center text-[11px] text-white/35">
        扔出去就收不回来，会匿名漂到另一位同学手里
      </p>
    </div>
  </div>
</template>
