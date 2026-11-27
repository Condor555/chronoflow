#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
import json, sys

BASELINE_URL = 'http://127.0.0.1:8765/baseline/index.html'
CURRENT_URL = 'http://127.0.0.1:8765/current/index.html'
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'render-output')
OUT.mkdir(parents=True, exist_ok=True)

FIXTURE_JS = r"""
async ({screen, autoExit}) => {
  const baseScreen = screen.startsWith('calendar') ? 'calendar' : screen.startsWith('settings') ? 'settings' : screen;
  for (const id of ['loading-view','configuration-view','auth-view','install-banner']) {
    const node = document.getElementById(id); if (node) node.hidden = true;
  }
  const shell = document.getElementById('app-shell'); shell.hidden = false;
  document.querySelectorAll('.screen').forEach(el => el.hidden = el.dataset.screen !== baseScreen);
  document.querySelectorAll('.nav-item').forEach(el => {
    const active = el.dataset.target === baseScreen;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
  document.getElementById('account-name').textContent = 'Fabrizio';
  document.getElementById('account-email').textContent = 'fabrizio@example.it';
  document.getElementById('account-initial').textContent = 'F';
  document.getElementById('sync-status').textContent = 'Sincronizzato';
  document.getElementById('today-date').textContent = 'venerdì 27 novembre 2026';
  document.getElementById('today-type-badge').textContent = 'Casa · Smart Working';
  document.getElementById('today-type-badge').className = 'type-badge smart';
  document.querySelectorAll('.location-option').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.location === 'smart')));
  const hero = document.getElementById('work-timer-card');
  hero.className = 'hero-card mode-smart'; hero.dataset.mode = 'smart';
  document.getElementById('work-mode-label').textContent = '⌂ Casa · Smart Working';
  document.getElementById('work-state-label').textContent = 'Stai lavorando';
  document.getElementById('work-main-value').textContent = '4:17:08';
  document.getElementById('work-main-caption').textContent = 'Restano 3:18:52 di lavoro.';
  document.getElementById('primary-action').textContent = 'Inizia pausa';
  document.getElementById('exit-action').hidden = Boolean(autoExit);
  const note = document.getElementById('smart-auto-exit-note');
  if (note) { note.hidden = !autoExit; note.textContent = autoExit ? 'Uscita automatica alle 16:06' : ''; }
  document.getElementById('worked-value').textContent = '4:17:08';
  document.getElementById('forecast-value').textContent = '16:06';
  document.getElementById('overtime-value').textContent = '0:00:00';
  document.getElementById('ticket-value').textContent = 'Sì';

  const grid = document.getElementById('calendar-grid');
  if (grid) {
    grid.replaceChildren();
    for (let day=1; day<=35; day++) {
      const b=document.createElement('button'); b.type='button'; b.className='calendar-day';
      const n=document.createElement('span'); n.className='date-number'; n.textContent=String(day<=30?day:day-30); b.append(n);
      if ([2,3,5,9,12,16,18,23,26,27].includes(day)) {
        const code=document.createElement('span'); const mode=day%3===0?'smart':day%5===0?'travel':'office';
        code.className=`day-code ${mode}`; code.textContent=mode==='smart'?'S':mode==='travel'?'T':'U'; b.append(code);
      }
      grid.append(b);
    }
  }
  const cards=document.getElementById('summary-cards');
  if (cards) cards.innerHTML='<article class="summary-card"><span>Giorni lavorati</span><strong>19</strong></article><article class="summary-card"><span>Straordinario</span><strong>8:33</strong></article><article class="summary-card"><span>Buoni pasto</span><strong>16</strong></article>';

  if (screen === 'calendar-shared' || screen === 'settings-sharing') {
    const { CalendarSharingView } = await import('./src/calendar-sharing-view.v3.0.5.mjs');
    const rows = [
      { work_date:'2026-11-02', mode:'office' }, { work_date:'2026-11-03', mode:'smart' },
      { work_date:'2026-11-05', mode:'travel' }, { work_date:'2026-11-09', mode:'smart' },
      { work_date:'2026-11-12', mode:'office' }, { work_date:'2026-11-18', mode:'smart' }
    ];
    const dashboard = {
      space:{id:'mine',is_enabled:true},
      settings:{share_work_mode:true},
      members:[{id:'m1',display_name:'Alessandra',email_masked:'a***@example.it'}],
      invitations:[{id:'i1',invitee_email:'mario@example.it',status:'pending'}]
    };
    const service = {
      ensurePersonalSpace: async()=>dashboard.space,
      getDashboard: async()=>dashboard,
      listIncomingInvitations: async()=>[],
      listSharedCalendars: async()=>[{space_id:'shared-1',owner_display_name:'Alessandra'}],
      getSharedCalendar: async()=>rows,
      setEnabled:async()=>{}, updateSettings:async()=>{}, invite:async()=>{}, revoke:async()=>{},
      cancelInvitation:async()=>{}, respondInvitation:async()=>{}
    };
    if (screen === 'calendar-shared') {
      document.getElementById('calendar-personal-panel').hidden = true;
      document.getElementById('calendar-shared-panel').hidden = false;
      document.querySelector('[data-calendar-scope="mine"]').classList.remove('active');
      document.querySelector('[data-calendar-scope="shared"]').classList.add('active');
      const root=document.getElementById('calendar-sharing-root');
      const view=new CalendarSharingView(root,service,{includeMine:false,initialSection:'shared',allowSettings:false});
      await view.init();
    } else {
      const details=document.getElementById('calendar-sharing-settings'); details.open=true;
      const root=document.getElementById('calendar-sharing-settings-root');
      const view=new CalendarSharingView(root,service,{includeMine:false,initialSection:'settings',allowSettings:true,embeddedSettings:true});
      await view.init();
      details.scrollIntoView({block:'start'});
    }
  }
  if (screen !== 'settings-sharing') window.scrollTo(0,0);
}
"""


def render(browser, url, name, width, height, screen='today', auto_exit=True):
    page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1)
    page.route('https://cdn.jsdelivr.net/**', lambda route: route.abort())
    page.goto(url, wait_until='domcontentloaded')
    page.evaluate(FIXTURE_JS, {'screen': screen, 'autoExit': auto_exit})
    page.screenshot(path=str(OUT / f'{name}.png'), full_page=False)
    metrics = page.evaluate("""() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      nav: [...document.querySelectorAll('.bottom-nav .nav-item span')].map(x => x.textContent.trim()),
      hero: Boolean(document.querySelector('#work-timer-card.hero-card')),
      profile: Boolean(document.querySelector('#account-button, #account-panel')),
      visibleScreen: [...document.querySelectorAll('.screen')].find(x => !x.hidden)?.dataset.screen
    })""")
    page.close()
    return metrics

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/opt/pw-browsers/chromium-current/chrome-linux64/chrome', args=['--no-sandbox'])
    report = {}
    # Pixel comparison of the authoritative 2.9.4 shell for the same Today state.
    report['baseline_mobile'] = render(browser, BASELINE_URL, 'baseline-mobile-today', 390, 844, auto_exit=False)
    report['current_mobile'] = render(browser, CURRENT_URL, 'current-mobile-today', 390, 844, auto_exit=False)
    report['baseline_desktop'] = render(browser, BASELINE_URL, 'baseline-desktop-today', 1440, 1000, auto_exit=False)
    report['current_desktop'] = render(browser, CURRENT_URL, 'current-desktop-today', 1440, 1000, auto_exit=False)
    report['autoexit_mobile'] = render(browser, CURRENT_URL, 'current-mobile-today-auto-exit', 390, 844, auto_exit=True)
    report['autoexit_desktop'] = render(browser, CURRENT_URL, 'current-desktop-today-auto-exit', 1440, 1000, auto_exit=True)
    report['calendar_mobile'] = render(browser, CURRENT_URL, 'current-mobile-calendar', 390, 844, 'calendar')
    report['calendar_desktop'] = render(browser, CURRENT_URL, 'current-desktop-calendar', 1440, 1000, 'calendar')
    report['shared_mobile'] = render(browser, CURRENT_URL, 'current-mobile-calendar-shared', 390, 844, 'calendar-shared')
    report['shared_desktop'] = render(browser, CURRENT_URL, 'current-desktop-calendar-shared', 1440, 1000, 'calendar-shared')
    report['summary_mobile'] = render(browser, CURRENT_URL, 'current-mobile-summary', 390, 844, 'summary')
    report['settings_desktop'] = render(browser, CURRENT_URL, 'current-desktop-settings', 1440, 1000, 'settings')
    report['settings_sharing_mobile'] = render(browser, CURRENT_URL, 'current-mobile-settings-sharing', 390, 844, 'settings-sharing')
    browser.close()

for key, value in report.items():
    assert value['overflow'] is False, f'{key}: overflow orizzontale {value}'
    assert value['nav'] == ['Oggi','Calendario','Riepilogo','Impostazioni'], f'{key}: navigazione incompleta'
    assert value['profile'] is True

# With post-2.9.4 extensions hidden, the authoritative shell should be pixel-identical.
def diff_ratio(a, b):
    left=Image.open(OUT/a).convert('RGB'); right=Image.open(OUT/b).convert('RGB')
    diff=ImageChops.difference(left,right)
    changed=sum(1 for pixel in diff.getdata() if pixel != (0,0,0))
    return changed/(left.width*left.height)

report['pixel_diff_mobile_today'] = diff_ratio('baseline-mobile-today.png','current-mobile-today.png')
report['pixel_diff_desktop_today'] = diff_ratio('baseline-desktop-today.png','current-desktop-today.png')
assert report['pixel_diff_mobile_today'] < 0.01, report['pixel_diff_mobile_today']
assert report['pixel_diff_desktop_today'] < 0.01, report['pixel_diff_desktop_today']
(OUT/'render-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps(report, indent=2, ensure_ascii=False))
