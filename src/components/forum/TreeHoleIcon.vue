<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'night-light' | 'animal' | 'cloud-moon'
  }>(),
  {
    variant: 'night-light',
  },
)
</script>

<template>
  <svg
    viewBox="0 0 96 96"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-label="
      variant === 'night-light'
        ? '暖光小夜灯'
        : variant === 'animal'
          ? '树洞里的小猫'
          : '包裹月亮的温柔云朵'
    "
  >
    <template v-if="variant === 'night-light'">
      <circle cx="48" cy="49" r="34" fill="#FFD98A" fill-opacity=".12" />
      <circle cx="48" cy="49" r="24" fill="#FFD98A" fill-opacity=".12" />
      <path
        d="M41 35H55L59 58H37L41 35Z"
        fill="#FFE8B5"
        stroke="#FFF5D8"
        stroke-width="2.6"
        stroke-linejoin="round"
      />
      <path d="M40 35C40 27.3 46.3 21 54 21H42C34.3 21 28 27.3 28 35H40Z" fill="#FFD47A" />
      <path d="M37 58H59V65H37V58Z" fill="#FFF4D4" />
      <path d="M43 65V72" stroke="#FFF4D4" stroke-width="3.6" stroke-linecap="round" />
      <path d="M53 65V72" stroke="#FFF4D4" stroke-width="3.6" stroke-linecap="round" />
      <path d="M36 72H60" stroke="#FFF5D8" stroke-width="3.6" stroke-linecap="round" />
      <path d="M67 26L69.5 32.5L76 35L69.5 37.5L67 44L64.5 37.5L58 35L64.5 32.5L67 26Z" fill="#FFF1C2" />
      <circle cx="28" cy="23" r="2.5" fill="#FFF7E4" />
      <circle cx="75" cy="55" r="2" fill="#FFF7E4" />
    </template>

    <template v-else-if="variant === 'animal'">
      <path
        d="M25 74C25 49 29 29 42 20C52 13 65 21 70 35C76 52 71 69 68 77H25V74Z"
        fill="#5F3E9D"
        stroke="#C7B4FF"
        stroke-width="2.4"
      />
      <path
        d="M35 77C35 60 38 45 48 42C58 45 61 60 61 77H35Z"
        fill="#3B246D"
      />
      <path d="M38 50L34 37L46 43L38 50Z" fill="#FFE2B8" stroke="#FFF4DE" stroke-width="2" stroke-linejoin="round" />
      <path d="M58 50L62 37L50 43L58 50Z" fill="#FFE2B8" stroke="#FFF4DE" stroke-width="2" stroke-linejoin="round" />
      <path
        d="M37 50C37 40.6 44.6 33 54 33C63.4 33 71 40.6 71 50V61C71 67.6 65.6 73 59 73H49C42.4 73 37 67.6 37 61V50Z"
        fill="#FFE2B8"
        stroke="#FFF4DE"
        stroke-width="2.4"
      />
      <circle cx="49" cy="52" r="2.2" fill="#3B246D" />
      <circle cx="61" cy="52" r="2.2" fill="#3B246D" />
      <path d="M53 58L55 61L57 58" stroke="#C87867" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M25 77C31 70 37 70 41 77" stroke="#FFE2B8" stroke-width="4" stroke-linecap="round" />
      <path d="M66 77C61 70 55 70 51 77" stroke="#FFE2B8" stroke-width="4" stroke-linecap="round" />
      <path d="M69 24L72 30L78 32L72 35L69 42L66 35L60 32L66 30L69 24Z" fill="#FFF0B5" />
      <circle cx="28" cy="28" r="2" fill="#FFF7E4" />
    </template>

    <template v-else>
      <path
        d="M27 62C19.8 62 14 56.2 14 49C14 42.2 19.2 36.7 25.9 36.1C28.7 25.8 38.1 18 49.3 18C61.6 18 71.6 27.8 71.8 40.1C79.8 41.2 86 48.1 86 56.4C86 65.5 78.6 73 69.5 73H34C27.1 73 21.5 68.3 20.4 62.2"
        fill="#D8D2FF"
        stroke="#F5F1FF"
        stroke-width="2.6"
        stroke-linejoin="round"
      />
      <path
        d="M60 25C51.2 25 44 32.2 44 41C44 49.8 51.2 57 60 57C63.1 57 66 56.2 68.5 54.8C64 53.5 60.7 49.3 60.7 44.4C60.7 38.3 65.6 33.4 71.7 33.4C72.2 33.4 72.7 33.4 73.2 33.5C71.1 28.5 66 25 60 25Z"
        fill="#FFF1AE"
      />
      <path d="M70 17L72.5 23L78.5 25.5L72.5 28L70 34L67.5 28L61.5 25.5L67.5 23L70 17Z" fill="#FFF6D5" />
      <circle cx="31" cy="28" r="2.5" fill="#FFF8E9" />
      <circle cx="82" cy="34" r="2" fill="#FFF8E9" />
    </template>
  </svg>
</template>

