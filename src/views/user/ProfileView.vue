<script setup lang="ts">
import { ref } from 'vue'
import {
  Check,
  ChevronRight,
  Copy,
  Eye,
  LockKeyhole,
  Save,
  ShieldCheck,
  UsersRound,
} from 'lucide-vue-next'
import AvatarEditor from '@/components/ui/AvatarEditor.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import { profile as mockProfile } from '@/data/mock'

const name = ref(mockProfile.name)
const college = ref(mockProfile.college)
const bio = ref(mockProfile.bio)
const privacy = ref(mockProfile.privacy)
const copied = ref(false)
const saving = ref(false)
const privacyOpen = ref(false)

const privacyOptions = [
  { key: '仅好友可见', description: '只有已经互加的同学能看到', icon: UsersRound },
  { key: '申请后可见', description: '对方发送申请，你同意后可见', icon: Eye },
  { key: '暂不公开', description: '任何同学都看不到联系方式', icon: LockKeyhole },
]

async function copyId() {
  try {
    await navigator.clipboard.writeText(mockProfile.identityId)
  } catch {
    // Preview browsers may not grant clipboard access.
  }
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1600)
}

function save() {
  saving.value = true
  window.setTimeout(() => {
    saving.value = false
  }, 850)
}
</script>

<template>
  <div class="page-scroll space-y-3 animate-fade-up">
    <section class="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-600 via-brand-500 to-cyan-500 px-5 pb-5 pt-6 text-center text-white shadow-[0_14px_34px_rgba(43,90,237,.22)]">
      <AvatarEditor :name="name" class="mx-auto" />
      <input
        v-model="name"
        maxlength="20"
        class="mx-auto mt-4 block h-10 w-full max-w-60 rounded-full border border-transparent bg-white/10 px-4 text-center text-base font-semibold text-white outline-none ring-1 ring-white/15 transition placeholder:text-white/50 focus:border-white/40"
        placeholder="输入昵称"
      />
      <p class="mt-2 text-xs text-white/65">头像支持相机角标入口，下一步可接系统相册</p>
    </section>

    <BaseCard>
      <h2 class="text-sm font-semibold text-ink">我的身份</h2>
      <button
        type="button"
        class="pressable mt-3 flex min-h-12 w-full items-center border-b border-line text-left"
      >
        <span class="w-20 shrink-0 text-xs text-muted">所在学院</span>
        <span class="min-w-0 flex-1 truncate text-sm font-medium text-brand-600">{{ college }}</span>
        <ChevronRight :size="18" class="text-faint" />
      </button>

      <label class="mt-3 block">
        <span class="mb-2 block text-xs text-muted">一句话介绍</span>
        <input
          v-model="bio"
          maxlength="40"
          class="h-11 w-full rounded-inner bg-slate-50 px-3 text-sm outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-brand-200"
        />
      </label>

      <div class="mt-3 rounded-inner bg-slate-50 p-3">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-medium text-muted">身份 ID</span>
          <button
            type="button"
            class="focus-ring pressable ml-auto flex min-h-9 items-center gap-1 rounded-full bg-white px-3 text-[11px] font-semibold text-brand-600 shadow-sm"
            @click="copyId"
          >
            <Check v-if="copied" :size="14" />
            <Copy v-else :size="14" />
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <p class="mt-2 break-all font-mono text-[11px] leading-5 text-slate-500">
          {{ mockProfile.identityId }}
        </p>
        <p class="mt-2 text-[11px] leading-5 text-faint">
          此 ID 用于加好友，不包含学号信息，安全防骚扰。
        </p>
      </div>
    </BaseCard>

    <BaseCard>
      <div class="flex items-center gap-3">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-inner bg-campusSoft text-campus">
          <ShieldCheck :size="21" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-ink">联系方式公开方式</p>
          <p class="mt-1 text-xs text-muted">{{ privacy }}</p>
        </div>
        <button
          type="button"
          class="focus-ring min-h-11 rounded-full bg-slate-100 px-4 text-xs font-medium text-muted"
          @click="privacyOpen = true"
        >
          修改
        </button>
      </div>
      <p class="mt-3 rounded-inner bg-slate-50 p-3 text-[11px] leading-5 text-muted">
        只有对方同意添加你之后，联系方式才会对他显示。
      </p>
    </BaseCard>

    <BaseButton block :loading="saving" @click="save">
      <Save v-if="!saving" :size="17" />
      {{ saving ? '保存中' : '保存资料' }}
    </BaseButton>

    <BottomSheet
      :open="privacyOpen"
      title="选择公开方式"
      description="随时可以回来修改，未互加好友时联系方式始终不可见。"
      @close="privacyOpen = false"
    >
      <div class="space-y-2">
        <button
          v-for="option in privacyOptions"
          :key="option.key"
          type="button"
          class="focus-ring pressable flex min-h-14 w-full items-center gap-3 rounded-inner border p-3 text-left transition"
          :class="
            privacy === option.key
              ? 'border-campus bg-campusSoft'
              : 'border-line hover:border-slate-300'
          "
          @click="privacy = option.key; privacyOpen = false"
        >
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            :class="privacy === option.key ? 'bg-campus text-white' : 'bg-slate-100 text-muted'"
          >
            <component :is="option.icon" :size="18" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-ink">{{ option.key }}</span>
            <span class="mt-0.5 block text-xs text-muted">{{ option.description }}</span>
          </span>
          <Check v-if="privacy === option.key" :size="18" class="text-campus" />
        </button>
      </div>
    </BottomSheet>
  </div>
</template>
