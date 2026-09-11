<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { APP, NAV_TABS, type NavTabId } from '@/config/app'
import { useAccount } from '@/composables/useAccount'
import Icon from './Icon.vue'

defineProps<{ active: NavTabId }>()
const emit = defineEmits<{ change: [id: NavTabId] }>()

const acct = useAccount()
const clock = ref('')
const date = ref('')
let timer: ReturnType<typeof setInterval> | null = null
function tick() {
  const now = new Date()
  clock.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  date.value = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
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
      <img src="/icon.png" alt="" width="48" height="48" />
      <div>
        <span class="rail__name">{{ APP.title }}</span>
        <span class="rail__tag">{{ APP.tagline }}</span>
      </div>
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
      <p class="rail__note">{{ APP.railNote }}</p>
      <span class="rail__rule"></span>
      <div class="rail__clock">{{ clock }}</div>
      <div class="rail__date">{{ date }}</div>
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
}
.rail__brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-6);
}
.rail__brand img {
  border-radius: 0.8rem;
}
.rail__brand > div {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.rail__name {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.rail__tag {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  white-space: nowrap;
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
  color: var(--accent);
  background: linear-gradient(90deg, rgba(242, 181, 68, 0.2), rgba(242, 181, 68, 0.06));
  border-color: rgba(242, 181, 68, 0.35);
}
.rail__item:focus {
  color: var(--text-primary);
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 0.2rem var(--focus-glow);
}
.rail__foot {
  margin-top: auto;
  padding-top: var(--sp-6);
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.55) 40%);
}
.rail__note {
  max-width: 11.5rem;
  font-size: var(--fs-md);
  font-weight: 600;
  line-height: 1.25;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}
.rail__rule {
  display: block;
  width: 2rem;
  height: 0.2rem;
  margin: var(--sp-3) 0 var(--sp-4);
  border-radius: var(--r-pill);
  background: var(--accent);
}
.rail__clock {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
}
.rail__date {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}
.rail__user {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
