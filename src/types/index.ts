export type Scene = 'brand' | 'forum' | 'market' | 'campus' | 'profile' | 'dark'

export interface Course {
  id: string
  name: string
  college: string
  major: string
  credit: number
  score: number | null
  reviewCount: number
  goodRate: number | null
  tags: string[]
  popularity: number
}

export interface Teacher {
  id: string
  name: string
  college: string
  score: number | null
  reviewCount: number
  courseCount: number
  tags: string[]
}

export interface ForumPost {
  id: string
  board: string
  title: string
  excerpt: string
  author: string
  time: string
  likes: number
  comments: number
  anonymous?: boolean
  pinned?: boolean
  course?: string
  kind?: 'standard' | 'vote'
  voteData?: VoteData
}

export interface VoteOption {
  id: string
  label: string
  votes: number
}

export interface VoteData {
  id: string
  title: string
  options: VoteOption[]
  totalVotes: number
  multiple: boolean
  hasVoted: boolean
  ended: boolean
  remainingHours: number
  anonymous: boolean
  visibility: '全部可见' | '仅关注者可见' | '特定院系可见'
  myOptionIds?: string[]
}

export interface CampusEvent {
  id: string
  title: string
  organizer: string
  date: string
  location: string
  type: 'official' | 'student'
  participants: number
}

export interface CalendarItem {
  id: string
  name: string
  date: string
  days: number
  note: string
  type: 'exam' | 'term' | 'event'
}

export interface CampusPlace {
  id: string
  name: string
  category: string
  description: string
  x: number
  y: number
}

export interface MarketItem {
  id: string
  title: string
  category: '寻物' | '招领' | '闲置'
  price?: number
  description: string
  location: string
  time: string
}

export interface UserProfile {
  name: string
  college: string
  bio: string
  identityId: string
  privacy: string
}
