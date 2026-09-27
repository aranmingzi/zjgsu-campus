<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  BookOpen,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PillSelector from '@/components/ui/PillSelector.vue'
import StickyFilterBar from '@/components/ui/StickyFilterBar.vue'
import { courses, teachers } from '@/data/mock'

type Scope = 'course' | 'teacher'
type Sort = 'score' | 'popular' | 'credit' | 'reviews'

const scope = ref<Scope>('course')
const selectedCollege = ref('全部院系')
const sort = ref<Sort>('score')
const keyword = ref('')

const colleges = ['全部院系', '工商管理学院', '统计与数学学院', '管工学院']
const sortItems = [
  { key: 'score' as const, label: '评分高到低' },
  { key: 'popular' as const, label: '按热度' },
  { key: 'credit' as const, label: '按学分' },
  { key: 'reviews' as const, label: '评价最多' },
]

const visibleCourses = computed(() => {
  const text = keyword.value.trim()
  const list = courses.filter((course) => {
    const inCollege =
      selectedCollege.value === '全部院系' || course.college.includes(selectedCollege.value.replace('学院', ''))
    const inSearch = !text || `${course.name}${course.major}${course.college}`.includes(text)
    return inCollege && inSearch
  })

  return [...list].sort((a, b) => {
    if (sort.value === 'credit') return b.credit - a.credit
    if (sort.value === 'popular') return b.popularity - a.popularity
    if (sort.value === 'reviews') return b.reviewCount - a.reviewCount
    return (b.score ?? -1) - (a.score ?? -1)
  })
})

const visibleTeachers = computed(() => {
  const text = keyword.value.trim()
  return teachers.filter((teacher) => !text || `${teacher.name}${teacher.college}`.includes(text))
})
</script>

<template>
  <div class="page-scroll animate-fade-up">
    <StickyFilterBar>
      <div class="mb-2.5 flex rounded-full bg-slate-100 p-1" role="tablist" aria-label="评价对象">
        <button
          v-for="item in [
            { key: 'course' as const, label: '课程评价' },
            { key: 'teacher' as const, label: '老师评价' },
          ]"
          :key="item.key"
          type="button"
          class="focus-ring min-h-10 flex-1 rounded-full text-sm font-medium transition"
          :class="scope === item.key ? 'bg-white text-brand-500 shadow-sm' : 'text-muted'"
          @click="scope = item.key"
        >
          {{ item.label }}
        </button>
      </div>

      <label class="flex h-11 items-center gap-2 rounded-full border border-white bg-white px-4 shadow-card">
        <Search :size="18" class="shrink-0 text-faint" />
        <input
          v-model="keyword"
          class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          :placeholder="scope === 'course' ? '搜索课程名或专业' : '搜索老师姓名或学院'"
        />
      </label>
    </StickyFilterBar>

    <div class="mt-3">
      <div class="mb-2 flex items-center justify-between">
        <span class="section-label">
          {{ scope === 'course' ? `共 ${visibleCourses.length} 门课` : `共 ${visibleTeachers.length} 位老师` }}
        </span>
        <span class="flex items-center gap-1 text-xs text-muted">
          <SlidersHorizontal :size="14" />
          筛选
        </span>
      </div>
      <PillSelector v-model="selectedCollege" :items="colleges" class="mb-2" />
      <PillSelector
        v-model="sort"
        :items="sortItems.map((item) => item.key)"
        :labels="Object.fromEntries(sortItems.map((item) => [item.key, item.label]))"
        class="mb-3"
      />
    </div>

    <template v-if="scope === 'course'">
      <div v-if="visibleCourses.length" class="space-y-3">
        <CourseCard
          v-for="course in visibleCourses"
          :key="course.id"
          :course-name="course.name"
          :score="course.score"
          :tags="course.tags"
          :reviews-count="course.reviewCount"
          :college="course.college"
          :major="course.major"
          :credit="course.credit"
          :good-rate="course.goodRate"
          :to="`/course/detail/${course.id}`"
        />
      </div>

      <EmptyState
        v-else
        title="暂时没有匹配的课程"
        description="换一个学院或关键词，也可以补充课程库里缺少的课程。"
        action-label="添加课程"
      />
    </template>

    <template v-else>
      <div class="space-y-3">
        <RouterLink
          v-for="teacher in visibleTeachers"
          :key="teacher.id"
          :to="`/course/teacher/${teacher.name}`"
          class="block"
        >
          <BaseCard clickable>
            <div class="flex items-center gap-3">
              <div
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-forum to-brand-500 text-base font-bold text-white"
              >
                {{ teacher.name.slice(0, 1) }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h2 class="text-sm font-semibold text-ink">{{ teacher.name }}</h2>
                  <span class="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-600">
                    官方名录
                  </span>
                </div>
                <p class="mt-1 truncate text-xs text-muted">{{ teacher.college }}</p>
                <div class="mt-2 flex gap-3 text-xs">
                  <span class="text-amber-500">
                    {{ teacher.score !== null ? `${teacher.score.toFixed(1)} 分` : '暂无评分' }}
                  </span>
                  <span class="text-muted">{{ teacher.courseCount }} 门课</span>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xs text-faint">评价</p>
                <p class="mt-1 text-lg font-bold text-brand-500">{{ teacher.reviewCount }}</p>
              </div>
            </div>
          </BaseCard>
        </RouterLink>
      </div>
    </template>

    <BaseCard
      class="mt-4 flex items-center gap-3 border-dashed bg-brand-50/40 shadow-none"
    >
      <span class="flex h-10 w-10 items-center justify-center rounded-inner bg-white text-brand-500">
        <Sparkles :size="19" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-ink">这些评价可信吗？</p>
        <p class="mt-1 text-xs leading-5 text-muted">
          课程评价默认匿名展示，评分和标签均由同学共建。
        </p>
      </div>
      <BookOpen :size="18" class="text-brand-400" />
    </BaseCard>
  </div>
</template>
