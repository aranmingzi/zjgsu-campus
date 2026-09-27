import type { VoteData } from '@/types'

export const VOTE_REFRESH_INTERVAL = 10_000

interface SubmitVotePayload {
  voteId: string
  optionIds: string[]
}

export interface VoteMutationResult {
  vote: VoteData
  requestId: string
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message || `投票请求失败：${response.status}`)
  }

  return response.json() as Promise<T>
}

export function createVote(payload: {
  postId: string
  title: string
  options: string[]
  multiple: boolean
  anonymous: boolean
  visibility: VoteData['visibility']
  expiresAt: string
}) {
  return request<VoteMutationResult>('/api/votes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function submitVote(payload: SubmitVotePayload) {
  return request<VoteMutationResult>(`/api/votes/${payload.voteId}/participate`, {
    method: 'POST',
    body: JSON.stringify({ optionIds: payload.optionIds }),
  })
}

export function fetchVote(voteId: string) {
  return request<{ vote: VoteData }>(`/api/votes/${voteId}`)
}

export function fetchVoteResults(voteId: string) {
  return request<{ vote: VoteData }>(`/api/votes/${voteId}/results`)
}

export function startVotePolling(
  voteId: string,
  onResult: (vote: VoteData) => void,
  onError?: (error: unknown) => void,
) {
  let timer: number | undefined
  let stopped = false

  const tick = async () => {
    if (stopped || document.hidden || !navigator.onLine) return
    try {
      const result = await fetchVoteResults(voteId)
      if (!stopped) onResult(result.vote)
    } catch (error) {
      if (!stopped) onError?.(error)
    }
  }

  const resume = () => {
    if (!document.hidden) void tick()
  }

  timer = window.setInterval(tick, VOTE_REFRESH_INTERVAL)
  document.addEventListener('visibilitychange', resume)

  return () => {
    stopped = true
    if (timer) window.clearInterval(timer)
    document.removeEventListener('visibilitychange', resume)
  }
}
