import {
  createRouter,
  createWebHistory,
  type RouteMeta,
  type RouteRecordRaw,
} from 'vue-router'
import type { Scene } from '@/types'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    scene: Scene
    isTab?: boolean
    showBack?: boolean
    darkHeader?: boolean
    pageType?: 'list' | 'form' | 'detail' | 'settings'
    description?: string
    fab?: {
      label: string
      to: string
    }
  }
}

const CourseList = () => import('@/views/course/CourseListView.vue')
const ForumList = () => import('@/views/forum/ForumListView.vue')
const MarketList = () => import('@/views/market/MarketListView.vue')
const CampusHub = () => import('@/views/campus/CampusHubView.vue')
const MineHome = () => import('@/views/mine/MineHomeView.vue')
const PostComposer = () => import('@/views/forum/PostComposerView.vue')
const HoleView = () => import('@/views/forum/HoleView.vue')
const ForumDetailView = () => import('@/views/forum/ForumDetailView.vue')
const BlindBoxView = () => import('@/views/campus/BlindBoxView.vue')
const CalendarView = () => import('@/views/tools/CalendarView.vue')
const PlacesView = () => import('@/views/tools/PlacesView.vue')
const ProfileView = () => import('@/views/user/ProfileView.vue')
const GenericPageView = () => import('@/views/GenericPageView.vue')

function generic(
  path: string,
  meta: RouteMeta,
  pageType: RouteMeta['pageType'] = 'list',
): RouteRecordRaw {
  return {
    path,
    name: path.replace(/[/:]/g, '-'),
    component: GenericPageView,
    meta: { ...meta, pageType, showBack: true },
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/course' },
  {
    path: '/course',
    name: 'course-list',
    component: CourseList,
    meta: { title: '课程评价', scene: 'brand', isTab: true, fab: { label: '发表评价', to: '/course/review/new' } },
  },
  generic('/course/detail/:id', {
    title: '课程详情',
    scene: 'brand',
    description: '评分、评价标签与同学讨论集中展示。',
  }, 'detail'),
  generic('/course/review/:courseId', {
    title: '写评价',
    scene: 'brand',
    description: '星级、标签和文字评价的表单骨架。',
  }, 'form'),
  generic('/course/teacher/:name', {
    title: '老师评价',
    scene: 'brand',
    description: '按老师聚合课程评分与学生反馈。',
  }, 'detail'),
  generic('/course/add', {
    title: '添加课程',
    scene: 'brand',
    description: '补全课程名称、学院、学分与课程类型。',
  }, 'form'),

  {
    path: '/forum',
    name: 'forum-list',
    component: ForumList,
    meta: { title: '校园论坛', scene: 'forum', isTab: true, fab: { label: '发帖', to: '/forum/post' } },
  },
  {
    path: '/forum/detail/:id',
    name: 'forum-detail',
    component: ForumDetailView,
    meta: {
      title: '帖子详情',
      scene: 'forum',
      showBack: true,
      description: '正文、投票结果、留言与互动操作。',
    },
  },
  {
    path: '/forum/post',
    name: 'forum-post',
    component: PostComposer,
    meta: {
      title: '发布帖子',
      scene: 'forum',
      showBack: true,
      description: '板块、帖子形式、配图与匿名设置。',
    },
  },
  {
    path: '/forum/hole',
    name: 'forum-hole',
    component: HoleView,
    meta: {
      title: '匿名树洞',
      scene: 'forum',
      showBack: true,
      darkHeader: true,
      description: '沉浸式匿名树洞与情绪互动。',
    },
  },
  generic('/forum/hidden', {
    title: '暂停展示的内容',
    scene: 'forum',
    description: '查看被举报内容并提交申诉。',
  }),

  {
    path: '/market',
    name: 'market-list',
    component: MarketList,
    meta: { title: '闲置分享', scene: 'market', isTab: true, fab: { label: '发布', to: '/market/edit' } },
  },
  generic('/market/detail/:id', {
    title: '详情',
    scene: 'market',
    description: '闲置或失物信息详情与联系入口。',
  }, 'detail'),
  generic('/market/edit', {
    title: '发布信息',
    scene: 'market',
    description: '分类、图片、描述、价格与交易地点。',
  }, 'form'),
  generic('/market/mine', {
    title: '我发布的',
    scene: 'market',
    description: '集中管理我发布的闲置与招领信息。',
  }),

  {
    path: '/campus',
    name: 'campus-hub',
    component: CampusHub,
    meta: {
      title: '校园',
      scene: 'campus',
      isTab: true,
      fab: { label: '发布活动', to: '/campus/add' },
    },
  },
  generic('/campus/add', {
    title: '发起校园活动',
    scene: 'campus',
    description: '活动时间、地点、人数上限与报名信息。',
  }, 'form'),
  generic('/campus/event/:id', {
    title: '活动详情',
    scene: 'campus',
    description: '活动介绍、报名状态与发起人信息。',
  }, 'detail'),
  {
    path: '/campus/blindbox',
    name: 'campus-blindbox',
    component: BlindBoxView,
    meta: {
      title: '校园盲盒 · 漂流瓶',
      scene: 'dark',
      showBack: true,
      darkHeader: true,
      description: '深色沉浸式捞取和投递匿名心事。',
    },
  },

  {
    path: '/mine',
    name: 'mine-home',
    component: MineHome,
    meta: { title: '我的', scene: 'profile', isTab: true },
  },
  generic('/mine/favorites', {
    title: '我的收藏',
    scene: 'profile',
    description: '收藏的帖子、课程与校园信息。',
  }),
  generic('/mine/drafts', {
    title: '草稿箱',
    scene: 'profile',
    description: '继续编辑未发布的帖子与评价。',
  }),
  {
    path: '/profile',
    name: 'user-profile',
    component: ProfileView,
    meta: {
      title: '我的资料',
      scene: 'profile',
      showBack: true,
      description: '头像、身份信息与隐私设置。',
    },
  },
  generic('/user/card/:id', {
    title: '同学名片',
    scene: 'profile',
    description: '同学公开资料与添加好友入口。',
  }, 'detail'),
  generic('/friends', {
    title: '我的同学',
    scene: 'profile',
    description: '好友列表与待处理请求。',
  }),
  generic('/chats', {
    title: '私信',
    scene: 'profile',
    description: '最近会话与未读消息。',
  }),
  generic('/chat/:id', {
    title: '私信',
    scene: 'profile',
    description: '消息内容与底部输入区。',
  }, 'detail'),
  generic('/guide', {
    title: '应用说明',
    scene: 'profile',
    description: '校园工具、隐私边界与使用说明。',
  }, 'settings'),

  {
    path: '/calendar',
    name: 'calendar-full',
    component: CalendarView,
    meta: {
      title: '校历倒计时',
      scene: 'campus',
      showBack: true,
      description: '近期节点与竖向时间轴。',
    },
  },
  generic('/resources', {
    title: '学习资料',
    scene: 'campus',
    description: '课程笔记、真题与资料共享。',
  }),
  {
    path: '/places',
    name: 'places-full',
    component: PlacesView,
    meta: {
      title: '校园地点',
      scene: 'campus',
      showBack: true,
      description: '地图标记、地点列表与到达方式。',
    },
  },
  generic('/memo', {
    title: '我的备忘',
    scene: 'campus',
    description: '个人待办与校园事项备忘。',
  }, 'form'),
  generic('/admin/moderation', {
    title: '内容审核',
    scene: 'profile',
    description: '举报队列、证据核对与批量处理。',
  }),
  { path: '/:pathMatch(.*)*', redirect: '/course' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

export default router
