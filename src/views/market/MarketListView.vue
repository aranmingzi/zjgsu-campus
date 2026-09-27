<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  BookOpenCheck,
  ChevronRight,
  MapPin,
  Search,
  ShoppingBag,
  Tag,
} from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'
import EmptyMarketState from '@/components/market/EmptyMarketState.vue'
import PillSelector from '@/components/ui/PillSelector.vue'
import StickyFilterBar from '@/components/ui/StickyFilterBar.vue'
import { marketItems } from '@/data/mock'

type Category = '全部' | '寻物' | '招领' | '闲置'
const category = ref<Category>('全部')
const keyword = ref('')
const categories: Category[] = ['全部', '寻物', '招领', '闲置']

const visibleItems = computed(() => {
  const text = keyword.value.trim()
  return marketItems.filter((item) => {
    const inCategory = category.value === '全部' || item.category === category.value
    const inSearch = !text || `${item.title}${item.description}${item.location}`.includes(text)
    return inCategory && inSearch
  })
})
</script>

<template>
  <div class="page-scroll animate-fade-up">
    <StickyFilterBar>
      <label class="flex h-11 items-center gap-2 rounded-full border border-white bg-white px-4 shadow-card">
        <Search :size="18" class="shrink-0 text-faint" />
        <input
          v-model="keyword"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          placeholder="搜丢失的物品 / 闲置"
        />
      </label>
    </StickyFilterBar>

    <PillSelector v-model="category" :items="categories" accent="market" class="mt-3" />

    <RouterLink
      to="/resources"
      class="focus-ring pressable mt-3 flex items-center gap-3 rounded-card border border-market/10 bg-gradient-to-r from-marketSoft to-white p-4 shadow-card"
    >
      <span class="flex h-11 w-11 items-center justify-center rounded-inner bg-market text-white shadow-sm">
        <BookOpenCheck :size="21" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-ink">学习资料共享</p>
        <p class="mt-1 text-xs text-muted">笔记、真题和讲义，上传后全校都能用</p>
      </div>
      <span class="text-xs font-semibold text-market">去分享</span>
      <ChevronRight :size="17" class="text-market/60" />
    </RouterLink>

    <div class="mt-4 mb-2 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-ink">校园信息墙</h2>
      <span class="text-xs text-faint">{{ visibleItems.length }} 条示例</span>
    </div>

    <EmptyMarketState v-if="visibleItems.length === 0" />

    <div v-else class="space-y-3">
      <RouterLink
        v-for="item in visibleItems"
        :key="item.id"
        :to="`/market/detail/${item.id}`"
        class="block"
      >
        <BaseCard clickable>
          <div class="flex items-start gap-3">
            <span
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-inner"
              :class="
                item.category === '闲置'
                  ? 'bg-marketSoft text-market'
                  : 'bg-brand-50 text-brand-500'
              "
            >
              <ShoppingBag v-if="item.category === '闲置'" :size="21" />
              <Tag v-else :size="21" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <h3 class="text-sm font-semibold leading-5 text-ink">{{ item.title }}</h3>
                <span
                  v-if="item.price !== undefined"
                  class="shrink-0 text-base font-bold text-market"
                >
                  ¥{{ item.price }}
                </span>
              </div>
              <p class="mt-1.5 line-clamp-2 text-xs leading-5 text-muted">
                {{ item.description }}
              </p>
              <div class="mt-3 flex items-center gap-3 text-[11px] text-faint">
                <span class="rounded-full px-2 py-0.5" :class="item.category === '闲置' ? 'bg-marketSoft text-market' : 'bg-brand-50 text-brand-600'">
                  {{ item.category }}
                </span>
                <span class="flex min-w-0 items-center gap-1 truncate">
                  <MapPin :size="12" />
                  {{ item.location }}
                </span>
                <span class="ml-auto shrink-0">{{ item.time }}</span>
              </div>
            </div>
          </div>
        </BaseCard>
      </RouterLink>
    </div>
  </div>
</template>
