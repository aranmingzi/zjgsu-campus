<script setup lang="ts">
import AppShell from '@/layouts/AppShell.vue'
</script>

<template>
  <div class="flex min-h-[100dvh] items-center justify-center bg-[#edf1f7] md:p-4">
    <div
      class="relative h-[100dvh] w-full overflow-hidden bg-white shadow-2xl md:h-[844px] md:max-h-[calc(100dvh-32px)] md:w-[390px] md:rounded-[34px] md:border md:border-white md:ring-1 md:ring-slate-200"
    >
      <AppShell>
        <RouterView v-slot="{ Component, route }">
          <Transition
            mode="out-in"
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-1"
            leave-active-class="transition duration-100 ease-in"
            leave-to-class="opacity-0"
          >
            <component :is="Component" :key="route.fullPath" />
          </Transition>
        </RouterView>
      </AppShell>
    </div>
  </div>
</template>
