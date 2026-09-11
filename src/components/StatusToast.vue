<script setup lang="ts">
import { useToast } from '@/composables/useToast'
const toast = useToast()
</script>

<template>
  <Transition name="fade">
    <div v-if="toast.message.value" class="toast" :data-tone="toast.tone.value" role="status">
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
  background: var(--panel);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow);
  font-weight: 600;
  white-space: nowrap;
}
.toast[data-tone='warn'] {
  border-color: var(--warning);
}
.toast[data-tone='bad'] {
  border-color: var(--danger);
}
</style>
