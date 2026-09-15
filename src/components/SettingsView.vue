<script setup lang="ts">
import { computed } from 'vue'
import { APP } from '@/config/app'
import { useAccount } from '@/composables/useAccount'
import { useCatalog } from '@/composables/useCatalog'
import { useToast } from '@/composables/useToast'
import { useSubtitles } from '@/composables/useSubtitles'
import { useTvNavigation } from '@/composables/useTvNavigation'
import type { OsLogin } from '@/services/opensubtitles'
import { IDLE_OPTIONS, useIdle } from '@/composables/useIdle'
import { ref } from 'vue'

const emit = defineEmits<{ signedOut: [] }>()
const acct = useAccount()
const catalog = useCatalog()
const toast = useToast()
const subs = useSubtitles()
const idle = useIdle()
const nav = useTvNavigation()
const subsStatus = ref<string | null>(null)

function quotaNote(login: OsLogin): string {
  const at = subs.spentUntil(login)
  if (!at) return ''
  return `Limit reached · resets ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function removeLogin(i: number) {
  subs.removeLogin(i)
  void nav.reanchorFocus('subs-add', /^subs-/)
}

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
      <h2>OLED protection</h2>
      <p class="muted">
        After this long with no remote input on a static screen, the app dims and drifts a clock about so nothing bright stays in one place. Full-screen playback never triggers it; a running preview stays visible. Any key restores the screen.
      </p>
      <div class="settings__actions">
        <button
          v-for="m in IDLE_OPTIONS"
          :key="m"
          class="chip"
          :class="{ 'is-active': idle.idleMinutes.value === m }"
          :data-focus-id="`settings-idle-${m}`"
          @click="idle.setMinutes(m)"
        >
          {{ m ? `${m} min` : 'Off' }}
        </button>
      </div>
    </section>

    <section class="panel settings__card">
      <h2>Subtitles</h2>
      <p class="muted">
        Movies and episodes can pull subtitles from SubDL and OpenSubtitles; set either key or both and the lists are merged. A free SubDL key (subdl.com, account panel) allows 300 downloads a day with no login. A free OpenSubtitles key (opensubtitles.com/consumers) allows 20 a day per account login.
      </p>
      <!--
        One column of full-width controls, walked with Up/Down only. Left and
        Right never leave a text field (they move the caret), and the spatial
        engine penalises horizontal drift, so a narrow button or a side-by-side
        pair under a wide field would be skipped or unreachable from the D-pad.
      -->
      <div class="settings__subs">
        <label class="settings__label">SubDL API key</label>
        <input v-model.trim="subs.settings.value.subdlKey" class="field" data-focus-id="subs-subdl" type="text" autocapitalize="off" autocomplete="off" placeholder="subdl_…" />
        <label class="settings__label">OpenSubtitles API key</label>
        <input v-model.trim="subs.settings.value.apiKey" class="field" data-focus-id="subs-key" type="text" autocapitalize="off" autocomplete="off" placeholder="Paste your API key" />
        <label class="settings__label">OpenSubtitles logins (optional) — each has its own daily download limit; when one is used up the next is tried</label>
        <template v-for="(login, i) in subs.settings.value.logins" :key="i">
          <input v-model.trim="login.username" class="field" :data-focus-id="`subs-user-${i}`" type="text" autocapitalize="off" autocomplete="off" :placeholder="`Username ${i + 1}`" />
          <span v-if="quotaNote(login)" class="tiny settings__note">{{ quotaNote(login) }}</span>
          <input v-model="login.password" class="field" :data-focus-id="`subs-pass-${i}`" type="password" autocomplete="off" :placeholder="`Password ${i + 1}`" />
          <button class="btn btn--ghost" :data-focus-id="`subs-del-${i}`" @click="removeLogin(i)">Remove login {{ i + 1 }}</button>
        </template>
        <button class="btn" data-focus-id="subs-add" @click="subs.addLogin()">Add login</button>
        <label class="settings__label">Languages, in order of preference (ISO codes)</label>
        <input v-model.trim="subs.settings.value.languages" class="field" data-focus-id="subs-langs" type="text" autocapitalize="off" autocomplete="off" placeholder="en,ms" />
        <button class="btn" data-focus-id="subs-test" :disabled="!subs.configured.value" @click="testSubs">Test connection</button>
        <span v-if="subsStatus" class="muted settings__note">{{ subsStatus }}</span>
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
.settings__subs {
  display: grid;
  grid-template-columns: minmax(0, 28rem) 1fr;
  gap: var(--sp-3);
}
.settings__subs > * {
  grid-column: 1;
}
.settings__subs > .settings__label,
.settings__subs > .settings__note {
  grid-column: 1 / -1;
}
.settings__subs .btn {
  justify-self: stretch;
}
.settings__subs .settings__label {
  margin-top: var(--sp-2);
}
.settings__note {
  margin-top: calc(-1 * var(--sp-2));
}
</style>
