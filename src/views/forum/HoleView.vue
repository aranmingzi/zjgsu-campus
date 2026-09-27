<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, MessageCircle, Sparkles } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmotionMoodIcon from '@/components/forum/EmotionMoodIcon.vue'

type MoodKey = 'calm' | 'happy' | 'sad' | 'angry' | 'awkward' | 'tired'

interface MoodTheme {
  label: string
  keywords: string[]
  base: string
  glow: string
  secondary: string
  accent: string
  dot: string
  prompt: string
}

const moodThemes: Record<MoodKey, MoodTheme> = {
  calm: {
    label: '平静',
    keywords: ['放松', '治愈', '晚安'],
    base: '#0b2944',
    glow: 'rgba(64, 170, 211, .34)',
    secondary: 'rgba(35, 101, 148, .3)',
    accent: '#a9e9ff',
    dot: 'rgba(188, 239, 255, .68)',
    prompt: '把今天轻轻放下，慢慢呼吸。',
  },
  happy: {
    label: '开心',
    keywords: ['分享', '好运', '哈哈'],
    base: '#5d3f1d',
    glow: 'rgba(255, 190, 78, .44)',
    secondary: 'rgba(244, 112, 68, .24)',
    accent: '#ffe39a',
    dot: 'rgba(255, 236, 168, .82)',
    prompt: '把这份快乐说出来，会变成双份。',
  },
  sad: {
    label: 'Emo',
    keywords: ['难过', '迷茫', '抱抱'],
    base: '#171438',
    glow: 'rgba(118, 83, 238, .4)',
    secondary: 'rgba(45, 64, 155, .32)',
    accent: '#d6cbff',
    dot: 'rgba(216, 207, 255, .78)',
    prompt: '不用马上振作，先在这里停一会儿。',
  },
  angry: {
    label: '愤怒',
    keywords: ['吐槽', '气死', '无语'],
    base: '#3c1018',
    glow: 'rgba(235, 86, 52, .42)',
    secondary: 'rgba(138, 37, 35, .34)',
    accent: '#ffc0a6',
    dot: 'rgba(255, 167, 117, .78)',
    prompt: '把火气留在这里，说完会轻一点。',
  },
  awkward: {
    label: '尴尬',
    keywords: ['社死', '脚趾抠地', '裂开'],
    base: '#292638',
    glow: 'rgba(145, 122, 177, .36)',
    secondary: 'rgba(91, 81, 118, .3)',
    accent: '#ddd2f4',
    dot: 'rgba(226, 214, 243, .66)',
    prompt: '大家都尴尬过，说出来就不只你一个。',
  },
  tired: {
    label: '疲惫',
    keywords: ['累麻了', '碎碎念', '求安慰'],
    base: '#222a24',
    glow: 'rgba(112, 140, 103, .34)',
    secondary: 'rgba(111, 91, 67, .26)',
    accent: '#e5ddc7',
    dot: 'rgba(240, 227, 194, .62)',
    prompt: '累的时候不用解释，靠一会儿就好。',
  },
}

const currentMood = ref<MoodKey>('sad')
const reacted = ref('')
const theme = computed(() => moodThemes[currentMood.value])

const holes = [
  {
    id: 1,
    mood: 'calm' as const,
    time: '刚刚',
    content: '今晚没有赶作业，洗完澡坐在窗边发了十分钟呆，突然觉得这样也很好。',
    hugs: 32,
    replies: 8,
  },
  {
    id: 2,
    mood: 'happy' as const,
    time: '8 分钟前',
    content: '在食堂捡到了自己上次忘拿的伞，失而复得的感觉也太好了！',
    hugs: 21,
    replies: 6,
  },
  {
    id: 3,
    mood: 'sad' as const,
    time: '22 分钟前',
    content: '最近总觉得时间不够用，课业、比赛和实习挤在一起，好像每件事都做不好。',
    hugs: 38,
    replies: 12,
  },
  {
    id: 4,
    mood: 'angry' as const,
    time: '35 分钟前',
    content: '小组作业第三次临时改时间了，真的不想再替所有人收拾进度。',
    hugs: 18,
    replies: 14,
  },
  {
    id: 5,
    mood: 'awkward' as const,
    time: '1 小时前',
    content: '刚才和老师打招呼，结果认错人了。现在只想换个星球生活。',
    hugs: 29,
    replies: 11,
  },
  {
    id: 6,
    mood: 'tired' as const,
    time: '2 小时前',
    content: '这周一直在连轴转，今晚不想做任何决定，只想安静喝一杯热的。',
    hugs: 26,
    replies: 9,
  },
]

const sortedHoles = computed(() =>
  [...holes].sort(
    (a, b) => Number(b.mood === currentMood.value) - Number(a.mood === currentMood.value),
  ),
)

const reactions = computed(() => {
  const list = [
    { key: 'hug', emoji: '💖', label: '抱抱' },
    { key: 'tea', emoji: '🍵', label: '递茶' },
    { key: 'pat', emoji: '🐾', label: '摸摸头' },
  ]
  if (currentMood.value === 'angry') {
    list.push({ key: 'punch', emoji: '👊', label: '拍拍你' })
  }
  return list
})

function selectMood(mood: MoodKey) {
  currentMood.value = mood
  if ('vibrate' in navigator) navigator.vibrate(8)
}
</script>

<template>
  <div class="emotion-shell min-h-full overflow-hidden px-4 pb-28 pt-4 text-white">
    <div class="emotion-background pointer-events-none absolute inset-0" />
    <div class="emotion-aura pointer-events-none absolute inset-x-0 top-0 h-72" />
    <div class="emotion-dots pointer-events-none absolute inset-0 opacity-55" />

    <div class="relative z-10">
      <section class="mx-auto max-w-sm text-center">
        <div
          class="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/12 bg-white/[0.07] shadow-[0_0_48px_var(--emotion-glow)] backdrop-blur-sm transition-colors duration-700"
        >
          <Transition name="mood-icon" mode="out-in">
            <EmotionMoodIcon
              :key="currentMood"
              :mood="currentMood"
              class="h-12 w-12 transition-colors duration-700"
              :style="{ color: theme.accent }"
            />
          </Transition>
        </div>
        <h2 class="mt-4 text-xl font-bold tracking-normal">树洞会接住每一种情绪</h2>
        <Transition name="mood-copy" mode="out-in">
          <p :key="currentMood" class="mt-2 text-xs leading-5 text-white/62">
            {{ theme.prompt }}
          </p>
        </Transition>
      </section>

      <div class="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="(item, key) in moodThemes"
          :key="key"
          type="button"
          class="focus-ring flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all duration-500"
          :class="
            currentMood === key
              ? 'border-white/30 bg-white/18 text-white shadow-sm backdrop-blur'
              : 'border-white/8 bg-white/[0.045] text-white/55'
          "
          @click="selectMood(key)"
        >
          <EmotionMoodIcon :mood="key" class="h-4 w-4" />
          {{ item.label }}
        </button>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="keyword in theme.keywords"
          :key="keyword"
          class="rounded-full border border-white/8 bg-white/[0.055] px-2.5 py-1 text-[10px] text-white/55 transition-colors duration-500"
        >
          # {{ keyword }}
        </span>
      </div>

      <TransitionGroup name="mood-post" tag="div" class="mt-4 space-y-3">
        <article
          v-for="hole in sortedHoles"
          :key="hole.id"
          class="rounded-card border border-white/10 bg-white/[0.075] p-4 shadow-[0_12px_34px_rgba(4,7,24,.16)] backdrop-blur-xl transition-all duration-700"
          :class="hole.mood === currentMood ? 'ring-1 ring-white/12' : 'opacity-[0.72]'"
        >
          <div class="flex items-center gap-2 text-[11px] text-white/45">
            <span
              class="flex h-7 w-7 items-center justify-center rounded-full border border-white/10"
              :style="{ color: moodThemes[hole.mood].accent }"
            >
              <EmotionMoodIcon :mood="hole.mood" class="h-4 w-4" />
            </span>
            <span>{{ moodThemes[hole.mood].label }}</span>
            <span>{{ hole.time }}</span>
            <span class="ml-auto flex items-center gap-1">
              <MessageCircle :size="13" />
              {{ hole.replies }}
            </span>
          </div>

          <p class="mt-3 text-sm leading-6 text-white/88">{{ hole.content }}</p>

          <div
            class="mt-4 grid gap-2"
            :class="hole.mood === 'angry' ? 'grid-cols-4' : 'grid-cols-3'"
          >
            <button
              v-for="emotion in reactions"
              :key="emotion.key"
              type="button"
              class="focus-ring flex min-h-11 items-center justify-center gap-1 rounded-inner border border-white/10 bg-white/[0.05] text-[11px] transition duration-200 active:scale-[0.95]"
              :class="[
                reacted === `${hole.id}-${emotion.key}`
                  ? 'border-white/30 bg-white/15 text-white'
                  : 'text-white/62',
                hole.mood === 'sad' && emotion.key === 'hug'
                  ? 'scale-105 border-pink-200/30 bg-pink-300/10 text-pink-50 shadow-[0_0_18px_rgba(244,114,182,.16)]'
                  : '',
                hole.mood === 'angry' && emotion.key === 'punch'
                  ? 'border-orange-300/25 bg-orange-400/10 text-orange-50'
                  : '',
              ]"
              @click="reacted = `${hole.id}-${emotion.key}`"
            >
              <span class="text-sm">{{ emotion.emoji }}</span>
              {{ emotion.label }}
            </button>
          </div>
        </article>
      </TransitionGroup>

      <div class="mt-4 rounded-card border border-white/10 bg-white/[0.06] p-4 text-center backdrop-blur-lg">
        <div class="flex items-center justify-center gap-2 text-sm font-semibold">
          <Sparkles :size="17" :style="{ color: theme.accent }" />
          写下你的匿名心事
        </div>
        <p class="mt-2 text-xs text-white/48">
          发布后头像、昵称和身份标识不会对其他同学展示
        </p>
        <BaseButton class="mt-4" block>
          去写一条
          <ChevronRight :size="17" />
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
@property --emotion-base {
  syntax: "<color>";
  inherits: true;
  initial-value: #171438;
}

@property --emotion-glow {
  syntax: "<color>";
  inherits: true;
  initial-value: rgba(118, 83, 238, 0.4);
}

@property --emotion-secondary {
  syntax: "<color>";
  inherits: true;
  initial-value: rgba(45, 64, 155, 0.32);
}

@property --emotion-dot {
  syntax: "<color>";
  inherits: true;
  initial-value: rgba(216, 207, 255, 0.78);
}

.emotion-shell {
  --emotion-base: v-bind("theme.base");
  --emotion-glow: v-bind("theme.glow");
  --emotion-secondary: v-bind("theme.secondary");
  --emotion-dot: v-bind("theme.dot");
  position: relative;
  background: var(--emotion-base);
  transition:
    --emotion-base 0.8s ease-in-out,
    --emotion-glow 0.8s ease-in-out,
    --emotion-secondary 0.8s ease-in-out,
    --emotion-dot 0.8s ease-in-out,
    background-color 0.8s ease-in-out;
}

.emotion-background {
  background:
    radial-gradient(circle at 18% 12%, var(--emotion-secondary), transparent 38%),
    radial-gradient(circle at 84% 72%, var(--emotion-secondary), transparent 42%),
    linear-gradient(180deg, transparent 0%, rgba(5, 8, 24, 0.42) 100%);
  transition: background 0.8s ease-in-out;
}

.emotion-aura {
  background: radial-gradient(circle at 50% 0%, var(--emotion-glow), transparent 66%);
  filter: blur(8px);
  transition: background 0.8s ease-in-out;
}

.emotion-dots {
  background-image:
    radial-gradient(circle, var(--emotion-dot) 0 1px, transparent 1.4px),
    radial-gradient(circle, var(--emotion-dot) 0 0.7px, transparent 1.2px);
  background-position:
    0 0,
    17px 23px;
  background-size:
    46px 46px,
    67px 67px;
  transition:
    background-image 0.8s ease-in-out,
    opacity 0.8s ease-in-out;
}

.mood-icon-enter-active,
.mood-icon-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.32s ease;
}

.mood-icon-enter-from {
  opacity: 0;
  transform: translateY(8px) rotate(-10deg) scale(0.82);
}

.mood-icon-leave-to {
  opacity: 0;
  transform: translateY(-8px) rotate(8deg) scale(0.82);
}

.mood-copy-enter-active,
.mood-copy-leave-active,
.mood-post-enter-active,
.mood-post-leave-active,
.mood-post-move {
  transition:
    opacity 0.38s ease,
    transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.mood-copy-enter-from,
.mood-copy-leave-to,
.mood-post-enter-from,
.mood-post-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
