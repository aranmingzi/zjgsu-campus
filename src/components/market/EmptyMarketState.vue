<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
</script>

<template>
  <section class="flex flex-col items-center rounded-card border border-white bg-white px-6 py-10 text-center shadow-card">
    <svg
      class="h-40 w-52"
      viewBox="0 0 240 176"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="空的牛皮纸袋插画"
    >
      <defs>
        <linearGradient id="bag-body" x1="52" y1="58" x2="190" y2="164" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFE3C7" />
          <stop offset="1" stop-color="#F8BE82" />
        </linearGradient>
        <linearGradient id="bag-shadow" x1="62" y1="130" x2="184" y2="173" gradientUnits="userSpaceOnUse">
          <stop stop-color="#F3A75D" stop-opacity=".32" />
          <stop offset="1" stop-color="#B85F18" stop-opacity=".08" />
        </linearGradient>
        <filter id="bag-soft-shadow" x="24" y="24" width="192" height="142" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#9A531D" flood-opacity=".14" />
        </filter>
      </defs>

      <ellipse cx="120" cy="159" rx="66" ry="9" fill="url(#bag-shadow)" />
      <g filter="url(#bag-soft-shadow)">
        <path
          d="M55 57H185L174 152C173.5 157.5 169 162 163.5 162H76.5C71 162 66.5 157.5 66 152L55 57Z"
          fill="url(#bag-body)"
          stroke="#D98C43"
          stroke-width="2"
        />
        <path d="M63 72H177" stroke="#E7A15D" stroke-width="2" stroke-linecap="round" />
        <path d="M68 80H171" stroke="#F0B77D" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 6" />
        <path
          d="M82 62V50C82 36.7 92.7 26 106 26H134C147.3 26 158 36.7 158 50V62"
          stroke="#C97831"
          stroke-width="4"
          stroke-linecap="round"
        />
        <path
          d="M82 57C91 45 149 45 158 57"
          stroke="#FFF3E6"
          stroke-width="3"
          stroke-linecap="round"
        />
        <path d="M89 96H151" stroke="#FEF7EF" stroke-width="8" stroke-linecap="round" />
        <path d="M96 112H144" stroke="#F8E2C8" stroke-width="6" stroke-linecap="round" />
      </g>

      <path d="M41 40L46 51L58 55L47 61L42 73L37 61L25 56L37 51L41 40Z" fill="#FFD59E" />
      <circle cx="194" cy="42" r="6" fill="#FFBA70" />
      <circle cx="205" cy="62" r="3" fill="#FFD8AE" />
      <path d="M193 91L197 99L206 102L198 106L195 115L190 106L182 103L191 99L193 91Z" fill="#FFCE91" />
    </svg>

    <h2 class="mt-3 text-base font-semibold text-ink">这里空空如也</h2>
    <p class="mt-2 max-w-56 text-xs leading-5 text-muted">
      快去发布你的第一件闲置吧，让好物在校园里继续流转。
    </p>
    <RouterLink
      to="/market/edit"
      class="focus-ring pressable mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-market px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(245,138,50,.22)]"
    >
      <Plus :size="17" />
      发布第一件闲置
    </RouterLink>
  </section>
</template>
