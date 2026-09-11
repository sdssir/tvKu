<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { APP } from '@/config/app'
import { useAccount } from '@/composables/useAccount'
import { useTvNavigation } from '@/composables/useTvNavigation'
import type { Credentials } from '@/types/iptv'

const emit = defineEmits<{ done: [] }>()
const acct = useAccount()
const nav = useTvNavigation()

const mode = ref<Credentials['type']>('xtream')
const server = ref('')
const username = ref('')
const password = ref('')
const m3uUrl = ref('')
const error = ref<string | null>(null)

onMounted(() => nav.focusFirst(/^login-mode-xtream$/))

async function submit() {
  error.value = null
  const c: Credentials =
    mode.value === 'xtream'
      ? { type: 'xtream', server: server.value.trim(), username: username.value.trim(), password: password.value }
      : { type: 'm3u', url: m3uUrl.value.trim() }
  if (c.type === 'xtream' && (!c.server || !c.username || !c.password)) {
    error.value = 'Fill in the server, username and password'
    return
  }
  if (c.type === 'm3u' && !/^https?:\/\//i.test(c.url)) {
    error.value = 'Enter the full playlist URL, starting with http'
    return
  }
  try {
    await acct.signIn(c)
    emit('done')
  } catch (err) {
    error.value = (err as Error).message || 'Could not sign in'
    void nav.reanchorFocus('login-submit')
  }
}
</script>

<template>
  <section class="login">
    <div class="login__brand">
      <img src="/largeIcon.png" alt="" width="96" height="96" />
      <h1>{{ APP.title }}</h1>
      <p class="muted">Sign in with the details from your IPTV provider</p>
    </div>

    <form class="login__form panel" @submit.prevent="submit">
      <div class="login__modes">
        <button
          type="button"
          class="btn"
          :class="{ 'btn--primary': mode === 'xtream' }"
          data-focus-id="login-mode-xtream"
          @click="mode = 'xtream'"
        >
          Xtream Codes
        </button>
        <button
          type="button"
          class="btn"
          :class="{ 'btn--primary': mode === 'm3u' }"
          data-focus-id="login-mode-m3u"
          @click="mode = 'm3u'"
        >
          M3U playlist
        </button>
      </div>

      <template v-if="mode === 'xtream'">
        <label class="login__label">Server URL</label>
        <input
          v-model="server"
          class="field"
          data-focus-id="login-server"
          type="url"
          inputmode="url"
          autocapitalize="off"
          autocomplete="off"
          placeholder="http://example.com:8080"
        />
        <label class="login__label">Username</label>
        <input
          v-model="username"
          class="field"
          data-focus-id="login-user"
          type="text"
          autocapitalize="off"
          autocomplete="off"
          placeholder="Username"
        />
        <label class="login__label">Password</label>
        <input
          v-model="password"
          class="field"
          data-focus-id="login-pass"
          type="password"
          autocomplete="off"
          placeholder="Password"
        />
      </template>
      <template v-else>
        <label class="login__label">Playlist URL</label>
        <input
          v-model="m3uUrl"
          class="field"
          data-focus-id="login-m3u"
          type="url"
          inputmode="url"
          autocapitalize="off"
          autocomplete="off"
          placeholder="http://example.com/get.php?username=…&type=m3u_plus"
        />
      </template>

      <p v-if="error" class="login__error">{{ error }}</p>

      <button type="submit" class="btn btn--primary login__submit" data-focus-id="login-submit" :disabled="acct.busy.value">
        <span v-if="acct.busy.value" class="spinner spinner--sm"></span>
        <span>{{ acct.busy.value ? 'Signing in…' : 'Sign in' }}</span>
      </button>
    </form>
  </section>
</template>

<style scoped>
.login {
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: var(--sp-8);
  padding: var(--safe-y) var(--safe-x);
  background:
    radial-gradient(60rem 40rem at 20% 30%, rgba(34, 197, 94, 0.12), transparent 60%),
    radial-gradient(50rem 40rem at 90% 80%, rgba(56, 189, 248, 0.1), transparent 60%),
    var(--bg-0);
}
.login__brand {
  justify-self: center;
  text-align: center;
}
.login__brand h1 {
  margin-top: var(--sp-4);
  font-size: var(--fs-3xl);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.login__brand img {
  margin: 0 auto;
  border-radius: var(--r-lg);
}
.login__form {
  width: 40rem;
  justify-self: center;
  padding: var(--sp-6);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.login__modes {
  display: flex;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
}
.login__label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin-top: var(--sp-2);
}
.login__error {
  color: #fca5a5;
  font-weight: 600;
}
.login__submit {
  margin-top: var(--sp-4);
  justify-content: center;
  min-height: 3.5rem;
}
.spinner--sm {
  width: 1.2rem;
  height: 1.2rem;
  border-width: 0.2rem;
  border-top-color: #06210f;
}
</style>
