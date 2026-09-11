<script setup lang="ts">
import { computed } from 'vue'
import { APP } from '@/config/app'
import { useAccount } from '@/composables/useAccount'
import { useCatalog } from '@/composables/useCatalog'
import { useToast } from '@/composables/useToast'
import { useSubtitles } from '@/composables/useSubtitles'
import { ref } from 'vue'

const emit = defineEmits<{ signedOut: [] }>()
const acct = useAccount()
const catalog = useCatalog()
const toast = useToast()
const subs = useSubtitles()
const subsStatus = ref<string | null>(null)

async function testSubs() {
  subsStatus.value = 'Checking…'
  try {
    subsStatus.value = await subs.test()
  } catch (err) {
    subsStatus.value = (err as Error).message
  }
}

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
  <div class="view">
    <header class="view__bar">
      <h1 class="view__title">Settings</h1>
    </header>
  <div class="settings view__body">
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
      <h2>Subtitles (OpenSubtitles)</h2>
      <p class="muted">
        Movies and episodes can pull subtitles from opensubtitles.com. Register a free API key at opensubtitles.com/consumers; a user login raises the daily download limit.
      </p>
      <label class="settings__label">API key</label>
      <input v-model.trim="subs.settings.value.apiKey" class="field" data-focus-id="subs-key" type="text" autocapitalize="off" autocomplete="off" placeholder="Paste your API key" />
      <div class="settings__two">
        <div>
          <label class="settings__label">Username (optional)</label>
          <input v-model.trim="subs.settings.value.username" class="field" data-focus-id="subs-user" type="text" autocapitalize="off" autocomplete="off" />
        </div>
        <div>
          <label class="settings__label">Password (optional)</label>
          <input v-model="subs.settings.value.password" class="field" data-focus-id="subs-pass" type="password" autocomplete="off" />
        </div>
      </div>
      <label class="settings__label">Languages, in order of preference (ISO codes)</label>
      <input v-model.trim="subs.settings.value.languages" class="field" data-focus-id="subs-langs" type="text" autocapitalize="off" autocomplete="off" placeholder="en,ms" />
      <div class="settings__actions">
        <button class="btn" data-focus-id="subs-test" :disabled="!subs.configured.value" @click="testSubs">Test connection</button>
        <span v-if="subsStatus" class="muted">{{ subsStatus }}</span>
      </div>
      <p class="tiny">While a movie plays: ▼ opens the subtitle list · red / green shift timing by 0.5 s. Your choice is remembered per title.</p>
    </section>

    <p class="tiny">{{ APP.title }} {{ APP.version }} · {{ APP.id }}</p>
  </div>
  </div>
</template>

<style scoped>
.settings {
  overflow-y: auto;
  padding-right: var(--sp-2);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 72rem;
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
  align-items: center;
  gap: var(--sp-3);
  margin-top: var(--sp-2);
}
.settings__label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}
.settings__two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
}
</style>
