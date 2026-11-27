#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
import json, sys

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'tests/render-output-3.3.0')
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8877/baseline/index.html'
CURRENT = 'http://127.0.0.1:8877/current/index.html'

BASE_FIXTURE = """() => {
  for (const id of ['loading-view','configuration-view','auth-view','install-banner']) {
    const node=document.getElementById(id); if(node) node.hidden=true;
  }
  document.getElementById('app-shell').hidden=false;
  document.querySelectorAll('.screen').forEach(node => node.hidden=node.dataset.screen!=='today');
  document.getElementById('today-date').textContent='venerdì 27 novembre 2026';
  document.getElementById('today-type-badge').textContent='Casa · Smart Working';
  document.getElementById('today-type-badge').className='type-badge smart';
  document.querySelectorAll('.location-option').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.location==='smart')));
  const hero=document.getElementById('work-timer-card'); hero.className='hero-card mode-smart'; hero.dataset.mode='smart';
  document.getElementById('work-mode-label').textContent='⌂ Casa · Smart Working';
  document.getElementById('work-state-label').textContent='Stai lavorando';
  document.getElementById('work-main-value').textContent='4:17:08';
  document.getElementById('work-main-caption').textContent='Restano 3:18:52 di lavoro.';
  document.getElementById('primary-action').textContent='Inizia pausa';
  document.getElementById('exit-action').hidden=true;
  document.getElementById('smart-auto-exit-note').hidden=false;
  document.getElementById('smart-auto-exit-note').textContent='Uscita automatica alle 16:06';
  document.getElementById('worked-value').textContent='4:17:08';
  document.getElementById('forecast-value').textContent='16:06';
  document.getElementById('overtime-value').textContent='0:00:00';
  document.getElementById('ticket-value').textContent='Sì';
  document.getElementById('account-name').textContent='Fabrizio';
  document.getElementById('account-email').textContent='fabrizio@example.it';
  document.getElementById('account-initial').textContent='F';
  window.scrollTo(0,0);
}"""

PROJECT_FIXTURE = """() => {
  const section=document.getElementById('today-projects'); section.hidden=false;
  document.getElementById('today-allocation-copy').textContent='6:30 allocate / 7:36 lavorate';
  document.getElementById('today-allocation-balance').textContent='Da associare 1:06';
  document.getElementById('today-allocation-progress').style.width='85.5%';
  const warning=document.getElementById('today-allocation-warning'); warning.hidden=false; warning.textContent='Manca 1:06 da associare a una commessa. Puoi completare la giornata comunque.';
  const list=document.getElementById('today-allocation-list');
  list.innerHTML='<div class="allocation-row"><div class="allocation-row-copy"><strong>C1234 · Salerno–Reggio Calabria</strong><span>09:00–12:00 · 3:00</span></div><button class="button ghost allocation-edit" type="button">Modifica</button></div><div class="allocation-row"><div class="allocation-row-copy"><strong>C2451 · Raddoppio S. Marco</strong><span>13:00–16:30 · 3:30</span></div><button class="button ghost allocation-edit" type="button">Modifica</button></div>';
}"""

SETTINGS_FIXTURE = """() => {
  document.querySelectorAll('.screen').forEach(node => node.hidden=node.dataset.screen!=='settings');
  document.querySelectorAll('#settings-screen details.settings-disclosure[data-settings-section]').forEach(node => node.open=false);
  const details=document.getElementById('project-settings'); details.open=true;
  details.querySelector('summary').setAttribute('aria-expanded','true');
  document.getElementById('projects-enabled').checked=true;
  document.getElementById('project-settings-content').hidden=false;
  document.getElementById('project-settings-summary').textContent='2 commesse attive';
  document.getElementById('project-list').innerHTML='<div class="project-admin-row"><div class="project-admin-copy"><strong>C1234</strong><span>Salerno–Reggio Calabria</span><small>Attiva</small></div><button class="button secondary project-status-action">Archivia</button></div><div class="project-admin-row"><div class="project-admin-copy"><strong>C2451</strong><span>Raddoppio S. Marco</span><small>Attiva</small></div><button class="button secondary project-status-action">Archivia</button></div>';
  const select=document.getElementById('default-project'); select.innerHTML='<option>C1234 · Salerno–Reggio Calabria</option>';
  details.scrollIntoView({block:'start'});
}"""

def screenshot(browser, url, name, width, height, extra=None):
    page=browser.new_page(viewport={'width':width,'height':height}, device_scale_factor=1)
    page.route('https://cdn.jsdelivr.net/**', lambda route: route.fulfill(status=200, content_type='text/javascript', body='export function createClient(){return null;}'))
    page.goto(url, wait_until='domcontentloaded')
    page.evaluate(BASE_FIXTURE)
    if extra: page.evaluate(extra)
    if name == 'projects-home-mobile':
        page.locator('#today-projects').scroll_into_view_if_needed()
    path=OUT/f'{name}.png'
    page.screenshot(path=str(path), full_page=False)
    metrics=page.evaluate("""() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      featureVisible: Boolean(document.getElementById('today-projects') && !document.getElementById('today-projects').hidden),
      minActionHeight: Math.min(...[...document.querySelectorAll('.button:not([hidden])')].map(x=>x.getBoundingClientRect().height).filter(Boolean)),
      openSettings: [...document.querySelectorAll('#settings-screen details.settings-disclosure[data-settings-section][open]')].map(x=>x.id),
      projectSettingsVisible: document.getElementById('project-settings-content') ? !document.getElementById('project-settings-content').hidden : false
    })""")
    page.close()
    return metrics

def diff_ratio(left, right):
    a=Image.open(left).convert('RGB'); b=Image.open(right).convert('RGB')
    assert a.size == b.size
    diff=ImageChops.difference(a,b)
    pixels = diff.get_flattened_data() if hasattr(diff, 'get_flattened_data') else diff.getdata()
    changed=sum(1 for pixel in pixels if pixel != (0,0,0))
    return changed/(a.width*a.height)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/opt/pw-browsers/chromium-current/chrome-linux64/chrome', args=['--no-sandbox'])
    report={}
    report['baseline_disabled_mobile']=screenshot(browser,BASE,'baseline-disabled-mobile',390,844)
    report['current_disabled_mobile']=screenshot(browser,CURRENT,'current-disabled-mobile',390,844)
    report['baseline_disabled_desktop']=screenshot(browser,BASE,'baseline-disabled-desktop',1440,1000)
    report['current_disabled_desktop']=screenshot(browser,CURRENT,'current-disabled-desktop',1440,1000)
    report['projects_mobile']=screenshot(browser,CURRENT,'projects-home-mobile',390,844,PROJECT_FIXTURE)
    report['projects_desktop']=screenshot(browser,CURRENT,'projects-home-desktop',1440,1000,PROJECT_FIXTURE)
    report['projects_settings_mobile']=screenshot(browser,CURRENT,'projects-settings-mobile',390,900,SETTINGS_FIXTURE)
    browser.close()

report['disabled_mobile_pixel_diff']=diff_ratio(OUT/'baseline-disabled-mobile.png',OUT/'current-disabled-mobile.png')
report['disabled_desktop_pixel_diff']=diff_ratio(OUT/'baseline-disabled-desktop.png',OUT/'current-disabled-desktop.png')
for key,value in report.items():
    if not isinstance(value,dict): continue
    assert not value['overflow'], f'{key}: overflow orizzontale'
    assert value['minActionHeight'] >= 44, f'{key}: target sotto 44px'
assert report['current_disabled_mobile']['featureVisible'] is False
assert report['current_disabled_desktop']['featureVisible'] is False
assert report['projects_mobile']['featureVisible'] is True
assert report['projects_settings_mobile']['openSettings'] == ['project-settings']
assert report['projects_settings_mobile']['projectSettingsVisible'] is True
assert report['disabled_mobile_pixel_diff'] == 0
assert report['disabled_desktop_pixel_diff'] == 0
(OUT/'verification-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps(report,indent=2,ensure_ascii=False))
