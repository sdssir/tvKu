<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { APP, NAV_TABS, type NavTabId } from '@/config/app'
import { useAccount } from '@/composables/useAccount'
import Icon from './Icon.vue'

defineProps<{ active: NavTabId }>()
const emit = defineEmits<{ change: [id: NavTabId] }>()

const acct = useAccount()
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
  <nav class="rail">
    <div class="rail__brand">
      <img src="/icon.png" alt="" width="40" height="40" />
      <span>{{ APP.title }}</span>
    </div>

    <ul class="rail__items">
      <li v-for="tab in NAV_TABS" :key="tab.id">
        <button class="rail__item" :class="{ 'is-active': tab.id === active }" :data-focus-id="`nav-${tab.id}`" @click="emit('change', tab.id)">
          <Icon :name="tab.icon" />
          <span>{{ tab.label }}</span>
        </button>
      </li>
    </ul>

    <div class="rail__foot">
      <div class="rail__clock">{{ clock }}</div>
      <div v-if="acct.account.value" class="tiny rail__user">{{ acct.account.value.username }}</div>
    </div>
  </nav>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  width: var(--rail-w);
  height: 100%;
  padding: var(--safe-y) var(--sp-4) var(--safe-y) var(--safe-x);
  border-right: 1px solid var(--line);
}
.rail__brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-7);
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.rail__brand img {
  border-radius: 0.7rem;
}
.rail__items {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.rail__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: 3.4rem;
  padding: 0 var(--sp-4);
  border-radius: var(--r-md);
  border: 2px solid transparent;
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text-secondary);
  text-align: left;
  transition:
    color var(--t-fast),
    background var(--t-fast);
}
.rail__item .icon {
  width: 1.5rem;
  height: 1.5rem;
}
.rail__item.is-active {
  color: var(--text-primary);
  background: var(--surface);
}
.rail__item.is-active::before {
  content: '';
  position: absolute;
  left: -0.35rem;
  top: 0.8rem;
  bottom: 0.8rem;
  width: 0.25rem;
  border-radius: var(--r-pill);
  background: var(--accent);
}
.rail__item:focus {
  color: var(--text-primary);
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 0.2rem var(--focus-glow);
}
.rail__foot {
  margin-top: auto;
}
.rail__clock {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.rail__user {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
