<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { APP, NAV_TABS, type NavTabId } from '@/config/app'

defineProps<{ active: NavTabId }>()
const emit = defineEmits<{ change: [id: NavTabId] }>()

const clock = ref('')
let timer: ReturnType<typeof setInterval> | null = null
function tick() {
  clock.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
onMounted(() => {
  tick()
  timer = setInterval(tick, 15_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <header class="topnav">
    <div class="topnav__brand">
      <img src="/icon.png" alt="" width="36" height="36" />
      <span>{{ APP.title }}</span>
    </div>
    <nav class="topnav__tabs">
      <button
        v-for="tab in NAV_TABS"
        :key="tab.id"
        class="tab"
        :class="{ 'is-active': tab.id === active }"
        :data-focus-id="`nav-${tab.id}`"
        @click="emit('change', tab.id)"
      >
        {{ tab.label }}
      </button>
    </nav>
    <div class="topnav__clock">{{ clock }}</div>
  </header>
</template>

<style scoped>
.topnav {
  display: grid;
  grid-template-columns: 14rem 1fr 14rem;
  align-items: center;
  height: 5.5rem;
  padding: 0 var(--safe-x);
  border-bottom: 1px solid var(--line);
}
.topnav__brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--fs-lg);
  font-weight: 800;
}
.topnav__brand img {
  border-radius: var(--r-sm);
}
.topnav__tabs {
  display: flex;
  justify-content: center;
  gap: var(--sp-2);
}
.tab {
  padding: 0 var(--sp-5);
  min-height: 3rem;
  border-radius: var(--r-pill);
  border: 2px solid transparent;
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text-secondary);
  transition:
    background var(--t-fast),
    color var(--t-fast);
}
.tab.is-active {
  color: var(--text-primary);
  background: var(--accent-soft);
}
.tab:focus {
  color: var(--text-primary);
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 0.25rem var(--focus-glow);
}
.topnav__clock {
  text-align: right;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
