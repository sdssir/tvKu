<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { usePlayer } from '@/composables/usePlayer'
const toast = useToast()
const player = usePlayer()
</script>

<template>
  <Transition name="fade">
    <!-- Full-screen playback draws subtitles at the bottom, so the toast moves up out of their way. -->
    <div v-if="toast.message.value" class="toast" :class="{ 'is-top': player.isOpen.value }" :data-tone="toast.tone.value" role="status">
      {{ toast.message.value }}
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 4rem;
  z-index: 90;
  transform: translateX(-50%);
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-pill);
  background: var(--panel-bg);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow-card);
  font-weight: 600;
  white-space: nowrap;
}
.toast.is-top {
  top: var(--safe-y);
  bottom: auto;
}
.toast[data-tone='warn'] {
  border-color: var(--warning);
}
.toast[data-tone='bad'] {
  border-color: var(--danger);
}
</style>
