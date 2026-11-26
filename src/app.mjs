import { supabase, hasSupabaseConfig } from './supabase-client.v3.0.3.mjs';
import { CalendarSharingService } from './calendar-sharing.mjs';
import { CalendarSharingView } from './calendar-sharing-view.mjs';
import { initHomeModePicker } from './home-display.mjs';

const app = document.querySelector('#app');
const status = document.querySelector('#status');
const signOut = document.querySelector('#sign-out');
const homeNav = document.querySelector('#home-nav');
const calendarNav = document.querySelector('#calendar-nav');
let calendarView;
let cleanupHome;

function announce(message, kind = 'success') {
  status.textContent = message;
  status.className = `toast ${kind === 'error' ? 'error' : ''}`;
  status.hidden = false;
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => { status.hidden = true; }, 4200);
}

function setAuthenticatedNavigation(authenticated) {
  for (const button of [signOut, homeNav, calendarNav]) button.hidden = !authenticated;
}

function renderConfigurationHelp() {
  setAuthenticatedNavigation(false);
  app.innerHTML = `<section class="config-card"><p class="eyebrow">CONFIGURAZIONE</p><h1>Collega Supabase</h1><p>Inserisci Project URL e Publishable/Anon Key in <code>src/config.js</code>, quindi applica la migrazione SQL inclusa.</p><p>I dati sensibili non sono protetti dalla chiave nel browser, ma dalle policy RLS e dalle funzioni SQL della migrazione.</p></section>`;
}

function renderAuth() {
  calendarView?.destroy();
  cleanupHome?.();
  setAuthenticatedNavigation(false);
  app.innerHTML = `<section class="auth-card"><p class="eyebrow">BENTORNATO</p><h1>Accedi a Chrono Flow</h1><p>La consultazione dei calendari condivisi richiede sempre un account autenticato.</p><form id="auth-form" class="auth-form"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label><label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" minlength="8" required></label><button type="submit">Accedi</button></form></section>`;
  app.querySelector('#auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: values.get('email'), password: values.get('password') });
    if (error) announce(error.message, 'error');
  });
}

function renderHome() {
  calendarView?.destroy();
  const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  app.innerHTML = `<section id="home-screen" class="home-shell"><div class="home-heading"><div><p class="eyebrow">LA TUA GIORNATA</p><h1>Oggi</h1><p>${date}</p></div><span class="mode-pill" data-role="mode-pill" data-mode="smart">Smart working</span></div><p><strong>Dove lavori oggi?</strong></p><div class="mode-picker" role="group" aria-label="Modalità di lavoro"><button data-home-mode="office">▥&nbsp; Ufficio</button><button data-home-mode="smart">⌂&nbsp; Casa</button><button data-home-mode="travel">↗&nbsp; Trasferta</button></div><article class="timer-card" data-role="timer-card" data-mode="smart"><span class="timer-mode-label" data-role="timer-mode-label">⌂&nbsp; Casa · Smart Working</span><h2>Giornata conclusa</h2><div class="timer-value">7:36</div><p>Hai lavorato 7:36.</p><button class="timer-action" disabled>Giornata conclusa</button></article></section>`;
  cleanupHome = initHomeModePicker(app.querySelector('#home-screen'), 'smart');
}

async function renderCalendar() {
  cleanupHome?.();
  calendarView?.destroy();
  app.innerHTML = '<div id="calendar-root"><p>Caricamento…</p></div>';
  calendarView = new CalendarSharingView(app.querySelector('#calendar-root'), new CalendarSharingService(supabase), { announce });
  await calendarView.init();
}

async function renderSession(session) {
  if (!session) return renderAuth();
  setAuthenticatedNavigation(true);
  renderCalendar().catch((error) => { announce(error.message, 'error'); });
}

homeNav.addEventListener('click', renderHome);
calendarNav.addEventListener('click', () => renderCalendar().catch((error) => announce(error.message, 'error')));
signOut.addEventListener('click', async () => { await supabase.auth.signOut(); });

if (!hasSupabaseConfig()) renderConfigurationHelp();
else {
  const { data } = await supabase.auth.getSession();
  await renderSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => { renderSession(session); });
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
