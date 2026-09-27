<script setup lang="ts">
import {
  Bookmark,
  ChevronRight,
  FileText,
  LifeBuoy,
  LockKeyhole,
  MessageCircle,
  NotebookPen,
  ShieldCheck,
  Sparkles,
} from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'
import { profile } from '@/data/mock'

const entries = [
  { label: '我的私信', description: '查看同学发来的消息', icon: MessageCircle, to: '/chats', tone: 'brand' },
  { label: '我的收藏', description: '帖子、课程与地点', icon: Bookmark, to: '/mine/favorites', tone: 'market' },
  { label: '我的备忘', description: '记下今天要做的事', icon: NotebookPen, to: '/memo', tone: 'campus' },
  { label: '我的草稿', description: '继续没有写完的内容', icon: FileText, to: '/mine/drafts', tone: 'forum' },
]

const privacyEntries = [
  { label: '隐私保护指引', description: '了解昵称、头像和联系方式的展示范围', icon: LockKeyhole, to: '/guide' },
  { label: '内容审核', description: '举报队列与人工复核入口', icon: ShieldCheck, to: '/admin/moderation' },
]
</script>

<template>
  <div class="page-scroll animate-fade-up">
    <section class="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-600 via-brand-500 to-cyan-500 px-5 pb-5 pt-6 text-white shadow-[0_14px_34px_rgba(43,90,237,.22)]">
      <div class="relative flex items-center gap-4">
        <RouterLink
          to="/profile"
          class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl font-bold ring-1 ring-white/25"
        >
          {{ profile.name.slice(0, 1) }}
        </RouterLink>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h2 class="truncate text-lg font-semibold">{{ profile.name }}</h2>
            <span class="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">已认证</span>
          </div>
          <p class="mt-1 truncate text-xs text-white/70">{{ profile.college }}</p>
          <p class="mt-1 truncate text-xs text-white/60">{{ profile.bio }}</p>
        </div>
        <ChevronRight :size="20" class="text-white/65" />
      </div>
      <RouterLink
        to="/profile"
        class="focus-ring mt-4 flex min-h-10 items-center justify-center rounded-full bg-white/12 text-xs font-semibold ring-1 ring-white/15"
      >
        编辑个人资料
      </RouterLink>
    </section>

    <div class="mt-3 grid grid-cols-3 gap-3">
      <BaseCard class="text-center">
        <p class="text-xl font-bold text-brand-500">12</p>
        <p class="mt-1 text-[11px] text-muted">课程评价</p>
      </BaseCard>
      <BaseCard class="text-center">
        <p class="text-xl font-bold text-forum">8</p>
        <p class="mt-1 text-[11px] text-muted">我的帖子</p>
      </BaseCard>
      <BaseCard class="text-center">
        <p class="text-xl font-bold text-market">5</p>
        <p class="mt-1 text-[11px] text-muted">我的收藏</p>
      </BaseCard>
    </div>

    <BaseCard :padded="false" class="mt-3 divide-y divide-line overflow-hidden">
      <RouterLink
        v-for="entry in entries"
        :key="entry.label"
        :to="entry.to"
        class="pressable flex min-h-16 items-center gap-3 px-4"
      >
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-inner"
          :class="{
            'bg-brand-50 text-brand-500': entry.tone === 'brand',
            'bg-marketSoft text-market': entry.tone === 'market',
            'bg-campusSoft text-campus': entry.tone === 'campus',
            'bg-forumSoft text-forum': entry.tone === 'forum',
          }"
        >
          <component :is="entry.icon" :size="19" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-ink">{{ entry.label }}</span>
          <span class="mt-0.5 block truncate text-xs text-muted">{{ entry.description }}</span>
        </span>
        <ChevronRight :size="18" class="text-faint" />
      </RouterLink>
    </BaseCard>

    <BaseCard class="mt-3 border-forum/10 bg-gradient-to-r from-forumSoft to-white shadow-none">
      <div class="flex items-center gap-3">
        <span class="flex h-11 w-11 items-center justify-center rounded-inner bg-forum text-white">
          <Sparkles :size="20" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-ink">去树洞放松一下</p>
          <p class="mt-1 text-xs text-muted">匿名心事不会出现在主论坛</p>
        </div>
        <RouterLink to="/forum/hole" class="min-h-11 px-2 py-3 text-xs font-semibold text-forum">
          进入
        </RouterLink>
      </div>
    </BaseCard>

    <BaseCard :padded="false" class="mt-3 divide-y divide-line overflow-hidden">
      <RouterLink
        v-for="entry in privacyEntries"
        :key="entry.label"
        :to="entry.to"
        class="pressable flex min-h-16 items-center gap-3 px-4"
      >
        <span class="flex h-10 w-10 items-center justify-center rounded-inner bg-slate-100 text-muted">
          <component :is="entry.icon" :size="19" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-ink">{{ entry.label }}</span>
          <span class="mt-0.5 block truncate text-xs text-muted">{{ entry.description }}</span>
        </span>
        <ChevronRight :size="18" class="text-faint" />
      </RouterLink>
    </BaseCard>

    <div class="mt-4 flex items-center justify-center gap-2 pb-2 text-[11px] text-faint">
      <LifeBuoy :size="14" />
      商砖小站 · 高保真页面骨架
    </div>
  </div>
</template>

