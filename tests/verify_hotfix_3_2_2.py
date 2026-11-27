#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests' / 'render-output-3.2.2'
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:8765/index.html'

SETUP = r'''() => {
  for (const id of ['loading-view','configuration-view','auth-view','install-banner']) {
    const node = document.getElementById(id); if (node) node.hidden = true;
  }
  document.getElementById('app-shell').hidden = false;
  document.querySelectorAll('.screen').forEach(el => el.hidden = el.dataset.screen !== 'today');
  document.getElementById('account-name').textContent = 'Fabrizio';
  document.getElementById('account-email').textContent = 'fabrizio@example.it';
  document.getElementById('account-initial').textContent = 'F';
  document.getElementById('sync-status').textContent = 'Sincronizzato';
  document.getElementById('today-date').textContent = 'venerdì 27 novembre 2026';
  const badge = document.getElementById('today-type-badge');
  badge.textContent = 'Casa · Smart Working'; badge.className = 'type-badge smart';
  document.querySelectorAll('.location-option').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.location === 'smart')));
  const hero = document.getElementById('work-timer-card');
  hero.className = 'hero-card mode-smart'; hero.dataset.mode = 'smart';
  document.getElementById('work-mode-label').textContent = '⌂ Casa · Smart Working';
  document.getElementById('work-state-label').textContent = 'Stai lavorando';
  document.getElementById('work-main-value').textContent = '4:17:08';
  document.getElementById('work-main-caption').textContent = 'Restano 3:18:52 di lavoro.';
  document.getElementById('primary-action').textContent = 'Inizia pausa';
  document.getElementById('exit-action').hidden = true;
  const note = document.getElementById('smart-auto-exit-note'); note.hidden = false; note.textContent = 'Uscita automatica alle 16:06';
  document.getElementById('worked-value').textContent = '4:17:08';
  document.getElementById('forecast-value').textContent = '16:06';
  document.getElementById('overtime-value').textContent = '0:00:00';
  document.getElementById('ticket-value').textContent = 'Sì';
  window.scrollTo(0, 0);
}'''

CONTRAST = r'''() => {
  const root = getComputedStyle(document.documentElement);
  const rgb = value => {
    const hex=value.trim().replace('#','');
    return [0,2,4].map(i => parseInt(hex.slice(i,i+2),16)/255);
  };
  const lum = value => rgb(value).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4)
    .reduce((sum,v,i) => sum + v*[.2126,.7152,.0722][i],0);
  const ratio = value => (1.05)/(lum(value)+.05);
  return Object.fromEntries(['office','smart','travel'].map(mode => [mode, {
    from: root.getPropertyValue(`--home-${mode}-deep-from`).trim(),
    to: root.getPropertyValue(`--home-${mode}-deep-to`).trim(),
    contrastFrom: ratio(root.getPropertyValue(`--home-${mode}-deep-from`)),
    contrastTo: ratio(root.getPropertyValue(`--home-${mode}-deep-to`))
  }]));
}'''

report = {'accordion': [], 'themes': {}}
with sync_playwright() as p:
  browser = p.chromium.launch(headless=True, executable_path='/opt/pw-browsers/chromium-current/chrome-linux64/chrome', args=['--no-sandbox'])
  page = browser.new_page(viewport={'width': 390, 'height': 844})
  page.goto(URL, wait_until='domcontentloaded')
  page.evaluate("""() => {
    for (const id of ['loading-view','configuration-view','auth-view','install-banner']) document.getElementById(id)?.setAttribute('hidden','');
    document.getElementById('app-shell').hidden=false;
    document.querySelectorAll('.screen').forEach(el => el.hidden = el.dataset.screen !== 'settings');
  }""")
  sections = ['profile-settings','work-mode-settings','ticket-settings','leave-settings','family-settings','notification-settings','calendar-sharing-settings','account-data-settings']
  initial = page.eval_on_selector_all('#settings-screen details.settings-disclosure[data-settings-section][open]', 'els => els.map(x => x.id)')
  if initial != ['profile-settings']: raise AssertionError(f'initial: {initial}')
  report['accordion'].append({'initial': initial})
  for section_id in sections[1:] + sections[:1]:
    page.locator(f'#{section_id} > summary').click()
    opened = page.eval_on_selector_all('#settings-screen details.settings-disclosure[data-settings-section][open]', 'els => els.map(x => x.id)')
    if opened != [section_id]: raise AssertionError(f'{section_id}: expected only itself open, got {opened}')
    report['accordion'].append({'clicked': section_id, 'open': opened})
  # Keyboard interaction is independently verified.
  page.locator('#work-mode-settings > summary').focus(); page.keyboard.press('Enter')
  opened = page.eval_on_selector_all('#settings-screen details.settings-disclosure[data-settings-section][open]', 'els => els.map(x => x.id)')
  if opened != ['work-mode-settings']: raise AssertionError(f'keyboard: {opened}')
  report['accordionKeyboard'] = opened
  page.close()

  for width,height,name in [(390,844,'home-card-mobile-390'),(1440,1000,'home-card-desktop-1440')]:
    page=browser.new_page(viewport={'width':width,'height':height}, device_scale_factor=1)
    page.goto(URL, wait_until='domcontentloaded'); page.evaluate(SETUP)
    if width == 390: page.evaluate('window.scrollTo(0, 92)')
    page.screenshot(path=str(OUT/f'{name}.png'), full_page=False)
    hero=page.locator('#work-timer-card')
    report[name] = {
      'viewport': [width,height],
      'heroBox': hero.bounding_box(),
      'backgroundImage': hero.evaluate("el => getComputedStyle(el).backgroundImage"),
      'decorationContent': hero.evaluate("el => getComputedStyle(el,'::after').content"),
      'pillBackground': page.locator('#today-type-badge').evaluate("el => getComputedStyle(el).backgroundImage"),
      'overflow': page.evaluate('document.documentElement.scrollWidth > innerWidth')
    }
    if report[name]['backgroundImage'] == 'none': raise AssertionError(f'{name}: gradient missing')
    if report[name]['decorationContent'] in ('none','normal'): raise AssertionError(f'{name}: decoration missing')
    if report[name]['pillBackground'] == 'none': raise AssertionError(f'{name}: pill gradient missing')
    if report[name]['overflow']: raise AssertionError(f'{name}: horizontal overflow')
    if report[name]['heroBox']['height'] < 280: raise AssertionError(f'{name}: hero too short')
    if width == 390: report['contrast'] = page.evaluate(CONTRAST)
    page.close()

  # Verify distinct computed palettes across all modes.
  page=browser.new_page(viewport={'width':900,'height':700}); page.goto(URL, wait_until='domcontentloaded'); page.evaluate(SETUP)
  for mode in ['office','smart','travel']:
    page.eval_on_selector('#work-timer-card', f"(el) => {{ el.className='hero-card mode-{mode}'; el.dataset.mode='{mode}'; }}")
    report['themes'][mode] = page.locator('#work-timer-card').evaluate("el => getComputedStyle(el).backgroundImage")
  if len(set(report['themes'].values())) != 3: raise AssertionError('Home palettes are not distinct')
  page.close(); browser.close()

for mode, values in report['contrast'].items():
  if values['contrastFrom'] < 4.5 or values['contrastTo'] < 4.5:
    raise AssertionError(f'{mode}: WCAG AA contrast failed: {values}')

(OUT/'verification-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
