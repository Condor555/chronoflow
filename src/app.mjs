import { supabase, hasSupabaseConfig } from './supabase-client.v3.0.3.mjs';
import { CalendarSharingService } from './calendar-sharing.mjs';
import { CalendarSharingView } from './calendar-sharing-view.mjs';
import { initHomeModePicker } from './home-display.mjs';
import { localIsoDate, TodayService } from './today.mjs';

const app = document.querySelector('#app');
const status = document.querySelector('#status');
const signOut = document.querySelector('#sign-out');
const homeNav = document.querySelector('#home-nav');
const calendarNav = document.querySelector('#calendar-nav');
const calendarService = supabase ? new CalendarSharingService(supabase) : null;
const todayService = calendarService ? new TodayService(calendarService) : null;
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

function homeMarkup(record, dateLabel) {
  const mode = record?.mode || 'office';
  const clockIn = record?.clock_in ?? null;
  const hasClockIn = typeof clockIn === 'string' && clockIn.length > 0;
  const title = hasClockIn ? 'Ingresso registrato' : 'Inizia la giornata';
  const value = hasClockIn ? clockIn : '--:--';
  const description = hasClockIn
    ? `Ingresso registrato alle ${clockIn}.`
    : 'Scegli dove lavori oggi e registra il tuo ingresso.';

  return `<section id="home-screen" class="home-shell">
    <div class="home-heading"><div><p class="eyebrow">LA TUA GIORNATA</p><h1>Oggi</h1><p>${dateLabel}</p></div><span class="mode-pill" data-role="mode-pill" data-mode="${mode}"></span></div>
    <p><strong>Dove lavori oggi?</strong></p>
    <div class="mode-picker" role="group" aria-label="Modalità di lavoro"><button data-home-mode="office">▥&nbsp; Ufficio</button><button data-home-mode="smart">⌂&nbsp; Casa</button><button data-home-mode="travel">↗&nbsp; Trasferta</button></div>
    <article class="timer-card" data-role="timer-card" data-mode="${mode}">
      <span class="timer-mode-label" data-role="timer-mode-label"></span><h2>${title}</h2><div class="timer-value">${value}</div><p>${description}</p>
      <button class="timer-action" data-action="clock-in" ${hasClockIn ? 'disabled' : ''}>${hasClockIn ? 'Ingresso registrato' : 'Registra ingresso'}</button>
    </article>
  </section>`;
}

function mountHome(record, today, dateLabel) {
  cleanupHome?.();
  app.innerHTML = homeMarkup(record, dateLabel);
  const root = app.querySelector('#home-screen');
  const cleanupPicker = initHomeModePicker(root, record?.mode || 'office');

  const onClick = async (event) => {
    const action = event.target.closest('[data-action="clock-in"]');
    if (!action || action.disabled) return;
    const mode = root.querySelector('[data-role="timer-card"]')?.dataset.mode || 'office';
    action.disabled = true;
    action.textContent = 'Registrazione…';
    try {
      const saved = await todayService.clockIn({ date: today, mode });
      announce('Ingresso registrato.');
      mountHome(saved, today, dateLabel);
    } catch (error) {
      action.disabled = false;
      action.textContent = 'Registra ingresso';
      announce(error.message || 'Impossibile registrare l’ingresso.', 'error');
    }
  };

  root.addEventListener('click', onClick);
  cleanupHome = () => {
    cleanupPicker();
    root.removeEventListener('click', onClick);
  };
}

async function renderHome() {
  calendarView?.destroy();
  cleanupHome?.();
  const now = new Date();
  const today = localIsoDate(now);
  const dateLabel = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  app.innerHTML = '<section class="home-shell" aria-busy="true"><p>Caricamento…</p></section>';

  let record = null;
  try {
    record = await todayService.load(today);
  } catch (error) {
    announce(error.message || 'Impossibile caricare la giornata.', 'error');
  }
  mountHome(record, today, dateLabel);
}

async function renderCalendar() {
  cleanupHome?.();
  calendarView?.destroy();
  app.innerHTML = '<div id="calendar-root"><p>Caricamento…</p></div>';
  calendarView = new CalendarSharingView(app.querySelector('#calendar-root'), calendarService, { announce });
  await calendarView.init();
}

async function renderSession(session) {
  if (!session) return renderAuth();
  setAuthenticatedNavigation(true);
  await renderHome();
}

homeNav.addEventListener('click', () => renderHome().catch((error) => announce(error.message, 'error')));
calendarNav.addEventListener('click', () => renderCalendar().catch((error) => announce(error.message, 'error')));
signOut.addEventListener('click', async () => { await supabase.auth.signOut(); });

if (!hasSupabaseConfig()) renderConfigurationHelp();
else {
  const { data } = await supabase.auth.getSession();
  await renderSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => { renderSession(session).catch((error) => announce(error.message, 'error')); });
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
