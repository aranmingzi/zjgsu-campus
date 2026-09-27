<script setup lang="ts">
defineProps<{
  mood: 'calm' | 'happy' | 'sad' | 'angry' | 'awkward' | 'tired'
}>()
</script>

<template>
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <template v-if="mood === 'happy'">
      <circle cx="32" cy="32" r="14" fill="currentColor" />
      <path d="M32 8V14M32 50V56M8 32H14M50 32H56M15 15L19 19M45 45L49 49M49 15L45 19M19 45L15 49" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </template>
    <template v-else-if="mood === 'sad'">
      <path d="M39 13C27 15 19 25 20 37C21 47 30 53 40 51C31 49 25 41 27 32C28 25 33 19 40 17L39 13Z" fill="currentColor" />
      <path d="M46 18L48.5 24L55 26.5L48.5 29L46 35L43.5 29L37 26.5L43.5 24L46 18Z" fill="currentColor" fill-opacity=".7" />
    </template>
    <template v-else-if="mood === 'angry'">
      <path d="M32 8C32 19 22 22 21 33C20 41 25 47 31 49C28 43 30 38 35 35C38 41 44 43 44 49C51 45 54 38 51 30C48 21 40 18 39 8C37 14 34 16 32 8Z" fill="currentColor" />
      <path d="M24 54C32 58 40 57 45 53" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </template>
    <template v-else-if="mood === 'awkward'">
      <path d="M15 40C15 26 22 17 32 17C42 17 49 26 49 40V47H15V40Z" fill="currentColor" fill-opacity=".38" />
      <path d="M18 41C20 36 25 34 32 34C39 34 44 36 46 41" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      <circle cx="25" cy="40" r="2" fill="currentColor" />
      <circle cx="39" cy="40" r="2" fill="currentColor" />
      <path d="M28 48C30 46 34 46 36 48" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      <path d="M18 23L13 18M46 23L51 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </template>
    <template v-else-if="mood === 'tired'">
      <path d="M18 21H46V31C46 40.9 37.9 49 28 49H26C20 49 16 45 16 39V21H18Z" fill="currentColor" fill-opacity=".78" />
      <path d="M46 25H50C54 25 56 28 56 32C56 37 53 40 48 40H46" stroke="currentColor" stroke-width="3" />
      <path d="M21 14C24 10 28 10 30 13C32 9 38 9 40 14" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      <path d="M18 54H47" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </template>
    <template v-else>
      <path d="M10 39C18 33 24 33 31 39C39 45 47 45 54 39" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
      <path d="M10 28C18 22 24 22 31 28C39 34 47 34 54 28" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".68" />
      <circle cx="48" cy="16" r="5" fill="currentColor" fill-opacity=".75" />
    </template>
  </svg>
</template>

