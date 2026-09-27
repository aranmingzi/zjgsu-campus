<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Flame,
  MessageCircle,
  Search,
  ThumbsUp,
  UserRound,
} from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'
import TreeHoleEntryCard from '@/components/forum/TreeHoleEntryCard.vue'
import PillSelector from '@/components/ui/PillSelector.vue'
import StickyFilterBar from '@/components/ui/StickyFilterBar.vue'
import VoteCard from '@/components/vote/VoteCard.vue'
import { boardOptions, hotTopics, posts } from '@/data/mock'

const keyword = ref('')
const board = ref('全部')
const sort = ref('最新')
const router = useRouter()
const boards = ['全部', ...boardOptions]
const sorts = ['最新', '热门', '最多赞', '最多留言']

function goToPost(id: string) {
  router.push(`/forum/detail/${id}`)
}
</script>

<template>
  <div class="page-scroll animate-fade-up">
    <StickyFilterBar>
      <label class="flex h-11 items-center gap-2 rounded-full border border-white bg-white px-4 shadow-card">
        <Search :size="18" class="shrink-0 text-faint" />
        <input
          v-model="keyword"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          placeholder="搜标题 / 内容 / 作者"
        />
      </label>
    </StickyFilterBar>

    <section class="mt-3">
      <div class="mb-2 flex items-center justify-between">
        <span class="section-label">热门话题</span>
        <span class="text-[11px] text-faint">大家都在讨论</span>
      </div>
      <div class="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="topic in hotTopics"
          :key="topic"
          type="button"
          class="focus-ring pressable min-h-9 shrink-0 rounded-full border border-forum/10 bg-forumSoft px-3.5 text-xs font-medium text-forum"
          @click="keyword = topic"
        >
          # {{ topic }}
        </button>
      </div>
    </section>

    <TreeHoleEntryCard class="mt-3" icon-variant="night-light" />

    <div class="mt-4">
      <PillSelector v-model="board" :items="boards" accent="forum" class="mb-2" />
      <PillSelector v-model="sort" :items="sorts" accent="forum" class="mb-3" />
    </div>

    <div class="space-y-3">
      <template
        v-for="post in posts"
        :key="post.id"
      >
        <VoteCard
          v-if="post.kind === 'vote' && post.voteData"
          :vote-data="post.voteData"
          @vote="() => undefined"
          @open="goToPost(post.id)"
          @discuss="goToPost(post.id)"
          @share="goToPost(post.id)"
        />

        <RouterLink
          v-else
          :to="`/forum/detail/${post.id}`"
          class="block"
        >
          <BaseCard clickable>
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-forumSoft px-2.5 py-1 text-[11px] font-medium text-forum">
              {{ post.board }}
            </span>
            <span
              v-if="post.pinned"
              class="rounded-full bg-dangerSoft px-2.5 py-1 text-[11px] text-danger"
            >
              置顶
            </span>
            <span class="ml-auto text-[11px] text-faint">{{ post.time }}</span>
          </div>

          <h2 class="mt-3 text-[15px] font-semibold leading-6 text-ink">{{ post.title }}</h2>
          <p class="mt-1.5 line-clamp-2 text-xs leading-5 text-muted">{{ post.excerpt }}</p>

          <div
            v-if="post.course"
            class="mt-3 inline-flex items-center gap-1 rounded-inner bg-brand-50 px-2.5 py-1.5 text-xs text-brand-600"
          >
            <span>关联课程</span>
            <span class="font-medium">{{ post.course }}</span>
          </div>

          <div class="mt-3 flex items-center border-t border-line/70 pt-3 text-xs text-muted">
            <span class="flex min-w-0 flex-1 items-center gap-1.5">
              <UserRound v-if="!post.anonymous" :size="14" />
              <span v-else class="text-sm">🎭</span>
              <span class="truncate">{{ post.author }}</span>
            </span>
            <span class="flex items-center gap-1 px-2">
              <ThumbsUp :size="14" />
              {{ post.likes }}
            </span>
            <span class="flex items-center gap-1 pl-2">
              <MessageCircle :size="14" />
              {{ post.comments }}
            </span>
          </div>
          </BaseCard>
        </RouterLink>
      </template>
    </div>

    <div class="mt-4 flex items-center justify-center gap-2 py-3 text-xs text-faint">
      <Flame :size="15" />
      已显示全部示例帖子
    </div>
  </div>
</template>
