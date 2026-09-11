<script setup lang="ts">
import { computed } from 'vue'
import { APP } from '@/config/app'
import { useAccount } from '@/composables/useAccount'
import { useCatalog } from '@/composables/useCatalog'
import { useToast } from '@/composables/useToast'

const emit = defineEmits<{ signedOut: [] }>()
const acct = useAccount()
const catalog = useCatalog()
const toast = useToast()

const expires = computed(() => {
  const at = acct.account.value?.expiresAt
  return at ? new Date(at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unlimited'
})
const source = computed(() => {
  const c = acct.credentials.value
  if (!c) return ''
  return c.type === 'xtream' ? c.server : c.url
})

async function refresh() {
  toast.show('Refreshing channel lists…')
  await catalog.load(true)
  toast.show(catalog.loadError.value ? catalog.loadError.value : 'Channel lists updated', catalog.loadError.value ? 'bad' : 'info')
}

function signOut() {
  acct.signOut()
  catalog.reset()
  emit('signedOut')
}
</script>

<template>
  <div class="settings">
    <section class="panel settings__card">
      <h2>Account</h2>
      <dl>
        <dt>Source</dt>
        <dd>{{ acct.sourceType.value === 'xtream' ? 'Xtream Codes' : 'M3U playlist' }}</dd>
        <dt>Server</dt>
        <dd class="settings__mono">{{ source }}</dd>
        <template v-if="acct.account.value">
          <dt>Username</dt>
          <dd>{{ acct.account.value.username }}</dd>
          <dt>Status</dt>
          <dd>{{ acct.account.value.status }}<span v-if="acct.account.value.isTrial"> (trial)</span></dd>
          <dt>Expires</dt>
          <dd>{{ expires }}</dd>
          <dt>Connections</dt>
          <dd>{{ acct.account.value.activeConnections }} / {{ acct.account.value.maxConnections }}</dd>
        </template>
      </dl>
      <dl>
        <dt>Channels</dt>
        <dd>{{ catalog.live.value.length.toLocaleString() }} live · {{ catalog.vod.value.length.toLocaleString() }} movies · {{ catalog.series.value.length.toLocaleString() }} series</dd>
      </dl>
      <div class="settings__actions">
        <button class="btn" data-focus-id="settings-refresh" :disabled="catalog.isLoading.value" @click="refresh">Refresh channel lists</button>
        <button class="btn btn--danger" data-focus-id="settings-signout" @click="signOut">Sign out</button>
      </div>
    </section>

    <section v-if="acct.sourceType.value === 'xtream'" class="panel settings__card">
      <h2>Live stream format</h2>
      <p class="muted">HLS is what the TV plays natively. Try MPEG-TS only if a provider's HLS streams fail.</p>
      <div class="settings__actions">
        <button class="btn" :class="{ 'btn--primary': acct.streamFormat.value === 'm3u8' }" data-focus-id="settings-fmt-hls" @click="acct.streamFormat.value = 'm3u8'">HLS (.m3u8)</button>
        <button class="btn" :class="{ 'btn--primary': acct.streamFormat.value === 'ts' }" data-focus-id="settings-fmt-ts" @click="acct.streamFormat.value = 'ts'">MPEG-TS (.ts)</button>
      </div>
    </section>

    <section class="panel settings__card">
      <h2>Live TV ordering</h2>
      <p class="muted">Inside each category, list channels whose name says 4K / FHD / HD before the rest. The provider's own order is kept within each tier; the All list is never reordered.</p>
      <div class="settings__actions">
        <button class="btn" :class="{ 'btn--primary': catalog.preferHd.value }" data-focus-id="settings-hd-on" @click="catalog.preferHd.value = true">HD channels first</button>
        <button class="btn" :class="{ 'btn--primary': !catalog.preferHd.value }" data-focus-id="settings-hd-off" @click="catalog.preferHd.value = false">Provider order</button>
      </div>
      <p class="tiny">The TV's own picture processing (Super Resolution, AI Picture Pro) already applies to this app; set it under ⚙ → Picture while a channel is playing.</p>
    </section>

    <p class="tiny">{{ APP.title }} {{ APP.version }} · {{ APP.id }}</p>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 70rem;
}
.settings__card {
  padding: var(--sp-5) var(--sp-6);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
h2 {
  font-size: var(--fs-lg);
  font-weight: 700;
}
dl {
  display: grid;
  grid-template-columns: 10rem 1fr;
  gap: var(--sp-2) var(--sp-4);
  margin: 0;
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 0;
}
.settings__mono {
  font-family: ui-monospace, monospace;
  font-size: var(--fs-sm);
  word-break: break-all;
}
.settings__actions {
  display: flex;
  gap: var(--sp-3);
  margin-top: var(--sp-2);
}
</style>
