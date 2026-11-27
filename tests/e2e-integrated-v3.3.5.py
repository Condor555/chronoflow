#!/usr/bin/env python3
"""Real Chromium DOM verification for the integrated Chrono Flow 3.3.5 build."""
from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
DATE = "2026-11-27"


def launch_chromium(playwright):
    explicit = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
    candidates = ([Path(explicit)] if explicit else []) + sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux64/chrome"), reverse=True)
    executable = next((str(path) for path in candidates if path and path.exists()), None)
    return playwright.chromium.launch(headless=True, executable_path=executable) if executable else playwright.chromium.launch(headless=True)


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def init_script(seed: dict, now: str, sharing: dict | None = None) -> str:
    seed_json = json.dumps(seed)
    sharing_json = json.dumps(sharing or {
        "space": {"id": "space-1", "is_enabled": True},
        "settings": {}, "members": [], "invitations": []
    })
    return f"""
(() => {{
  const RealDate = Date;
  const initialNow = new RealDate({json.dumps(now)}).getTime();
  let fakeNow;
  try {{ fakeNow = Number(localStorage.getItem('__cf_e2e_now')) || initialNow; }} catch {{ fakeNow = initialNow; }}
  class MockDate extends RealDate {{
    constructor(...args) {{ super(...(args.length ? args : [fakeNow])); }}
    static now() {{ return fakeNow; }}
  }}
  MockDate.parse = RealDate.parse; MockDate.UTC = RealDate.UTC;
  window.Date = MockDate;
  Object.defineProperty(navigator, 'onLine', {{ configurable: true, get: () => false }});

  const defaultSharing = {sharing_json};
  const loadSharing = () => {{
    try {{ return JSON.parse(localStorage.getItem('__cf_e2e_sharing') || 'null') || structuredClone(defaultSharing); }}
    catch {{ return structuredClone(defaultSharing); }}
  }};
  const saveSharing = (value) => localStorage.setItem('__cf_e2e_sharing', JSON.stringify(value));
  if (!localStorage.getItem('__cf_e2e_sharing')) saveSharing(defaultSharing);
  let inviteCalls = 0;

  const query = (table) => {{
    let payload = null;
    const api = {{
      select() {{ return api; }}, order() {{ return api; }}, gte() {{ return api; }}, lte() {{ return api; }},
      eq() {{ return api; }}, in() {{ return api; }}, delete() {{ return api; }},
      upsert(value) {{ payload = value; return api; }},
      single() {{ return Promise.resolve({{ data: Array.isArray(payload) ? payload[0] : payload || {{}}, error: null }}); }},
      maybeSingle() {{ return Promise.resolve({{ data: null, error: null }}); }},
      then(resolve) {{ return Promise.resolve({{ data: Array.isArray(payload) ? payload : [], error: null }}).then(resolve); }}
    }};
    return api;
  }};
  const supabase = {{
    from: query,
    rpc: async (name, args = {{}}) => {{
      const dashboard = loadSharing();
      if (name === 'cf_ensure_personal_calendar_space') return {{ data: 'space-1', error: null }};
      if (name === 'cf_get_calendar_sharing_dashboard') return {{ data: dashboard, error: null }};
      if (name === 'cf_list_calendar_invitations' || name === 'cf_list_shared_calendars') return {{ data: [], error: null }};
      if (name === 'cf_invite_calendar_viewer') {{
        inviteCalls += 1;
        const email = String(args.p_email || '').toLowerCase();
        const existing = dashboard.invitations.find(i => i.status === 'pending' && i.invitee_email.toLowerCase() === email);
        if (existing) return {{ data: existing.id, error: null }};
        const invite = {{ id: `invite-${{dashboard.invitations.length + 1}}`, invitee_email: email, status: 'pending' }};
        dashboard.invitations.unshift(invite); saveSharing(dashboard); return {{ data: invite.id, error: null }};
      }}
      if (name === 'cf_cancel_calendar_invitation') {{
        const invite = dashboard.invitations.find(i => i.id === args.p_invitation_id);
        if (invite) invite.status = 'cancelled'; saveSharing(dashboard); return {{ data: true, error: null }};
      }}
      if (name === 'cf_set_calendar_sharing_enabled') {{ dashboard.space.is_enabled = !!args.p_enabled; saveSharing(dashboard); return {{ data: !!args.p_enabled, error: null }}; }}
      if (name === 'cf_update_calendar_sharing_settings') {{ dashboard.settings = args.p_settings; saveSharing(dashboard); return {{ data: dashboard.settings, error: null }}; }}
      if (name === 'cf_revoke_calendar_member') {{ dashboard.members = dashboard.members.filter(m => m.id !== args.p_member_id); saveSharing(dashboard); return {{ data: true, error: null }}; }}
      return {{ data: [], error: null }};
    }}
  }};
  window.__CHRONO_FLOW_E2E__ = {{ seed: {seed_json}, supabase, ready: false }};
  window.__advanceClock = (milliseconds) => {{
    fakeNow += milliseconds; localStorage.setItem('__cf_e2e_now', String(fakeNow));
    window.__CHRONO_FLOW_E2E__.api?.renderTodayTick();
  }};
  window.__setInviteStatus = (status) => {{
    const dashboard = loadSharing();
    dashboard.invitations[0].status = status;
    if (status === 'accepted') dashboard.members = [{{ id: 'member-1', display_name: 'Mario Rossi', email_masked: 'ma***@example.test' }}];
    saveSharing(dashboard);
  }};
  window.__inviteCalls = () => inviteCalls;
}})();
"""


def route_assets(page):
    page.route("https://cdn.jsdelivr.net/**", lambda route: route.fulfill(
        status=200, content_type="text/javascript", body="export function createClient(){ return null; }"
    ))
    page.route("**/src/config.js*", lambda route: route.fulfill(
        status=200, content_type="text/javascript",
        body="export const SUPABASE_URL='https://example.supabase.co'; export const SUPABASE_PUBLISHABLE_KEY='test';"
    ))


def open_build(browser, base_url: str, seed: dict, now: str, sharing: dict | None = None):
    context = browser.new_context(timezone_id="Europe/Rome", viewport={"width": 1280, "height": 900})
    context.add_init_script(init_script(seed, now, sharing))
    page = context.new_page()
    route_assets(page)
    page.goto(base_url, wait_until="networkidle")
    page.wait_for_function("window.__CHRONO_FLOW_E2E__?.ready === true")
    return context, page


def base_seed(allocations=None, break_time="12:45"):
    return {
        "profile": {
            "display_name": "E2E",
            "target_minutes": 456,
            "office_break_minutes": 30,
            "smart_break_minutes": 60,
            "travel_break_minutes": 30,
            "family_settings": {"projects_enabled": True, "automatic_break_time": break_time}
        },
        "days": [{
            "work_date": DATE, "planned_type": "office", "actual_type": "office",
            "events": [{"id": "entry", "type": "entry", "at": f"{DATE}T08:43:00+01:00"}]
        }],
        "projects": [
            {"id": "p1", "user_id": "e2e-user", "code": "ALFA", "description": "Prima commessa", "is_active": True},
            {"id": "p2", "user_id": "e2e-user", "code": "BETA", "description": "Seconda commessa", "is_active": True}
        ],
        "allocations": allocations or []
    }


def scenario_register_and_single_edit(browser, url):
    context, page = open_build(browser, url, base_seed([]), f"{DATE}T12:00:00+01:00")
    page.click("#add-today-allocation")
    expect(page.locator("#allocation-dialog")).to_be_visible()
    assert page.locator('#allocation-project-options input:checked').count() == 0

    search = page.locator("#allocation-project-search")
    search.fill("ALFA")
    page.locator(".project-picker-option", has_text="ALFA").locator("input").check()
    expect(search).to_have_value("")
    page.wait_for_function("document.activeElement === document.querySelector('#allocation-project-search')")

    search.fill("BETA")
    page.locator(".project-picker-option", has_text="BETA").locator("input").check()
    expect(search).to_have_value("")
    page.wait_for_function("document.activeElement === document.querySelector('#allocation-project-search')")
    assert page.locator('#allocation-project-options input:checked').count() == 2

    page.click("#close-allocation-dialog")
    page.click("#add-today-allocation")
    assert page.locator('#allocation-project-options input:checked').count() == 0

    for code in ("ALFA", "BETA"):
        search.fill(code)
        page.locator(".project-picker-option", has_text=code).locator("input").check()
    page.locator("#allocation-form button[type=submit]").click()
    expect(page.locator("#today-allocation-list .allocation-row")).to_have_count(2)

    alpha = page.locator("#today-allocation-list .allocation-row", has_text="ALFA")
    beta = page.locator("#today-allocation-list .allocation-row", has_text="BETA")
    alpha_before = alpha.inner_text()
    beta.locator("button", has_text="Modifica").click()
    expect(page.locator("#allocation-edit-dialog")).to_be_visible()
    assert page.locator("#allocation-edit-dialog #allocation-project-search").count() == 0
    assert page.locator("#allocation-edit-dialog input[type=checkbox]").count() == 0
    page.locator("#allocation-edit-percentage").fill("40")
    page.locator("#allocation-edit-form button[type=submit]").click()
    assert alpha.inner_text() == alpha_before
    expect(beta).to_contain_text("40%")
    context.close()


def scenario_live_allocations_pause_and_views(browser, url):
    allocations = [
        {"id": "a1", "user_id": "e2e-user", "project_id": "p1", "work_date": DATE,
         "duration_minutes": 120, "allocation_method": "automatic", "allocation_percentage": 50},
        {"id": "a2", "user_id": "e2e-user", "project_id": "p2", "work_date": DATE,
         "duration_minutes": 75, "allocation_method": "hours", "allocation_percentage": None}
    ]
    context, page = open_build(browser, url, base_seed(allocations), f"{DATE}T12:43:00+01:00")
    alpha = page.locator("#today-allocation-list .allocation-row", has_text="ALFA")
    beta = page.locator("#today-allocation-list .allocation-row", has_text="BETA")
    expect(alpha).to_contain_text("2:00")
    expect(beta).to_contain_text("1:15")

    page.evaluate("__advanceClock(2 * 60 * 1000)")
    expect(page.locator("#work-state-label")).to_have_text("Pausa automatica")
    expect(page.locator("#primary-action")).to_be_disabled()
    expect(alpha).to_contain_text("2:01")
    expect(beta).to_contain_text("1:15")

    page.evaluate("__advanceClock(15 * 60 * 1000)")
    expect(alpha).to_contain_text("2:01")
    expect(beta).to_contain_text("1:15")
    page.reload(wait_until="networkidle")
    page.wait_for_function("window.__CHRONO_FLOW_E2E__?.ready === true")
    alpha = page.locator("#today-allocation-list .allocation-row", has_text="ALFA")
    beta = page.locator("#today-allocation-list .allocation-row", has_text="BETA")
    expect(page.locator("#work-state-label")).to_have_text("Pausa automatica")
    expect(alpha).to_contain_text("2:01")

    page.evaluate("__advanceClock(15 * 60 * 1000)")
    expect(page.locator("#primary-action")).to_be_disabled()
    expect(page.locator("#primary-action")).to_have_text("Pausa standard già applicata")
    page.reload(wait_until="networkidle")
    page.wait_for_function("window.__CHRONO_FLOW_E2E__?.ready === true")
    expect(page.locator("#primary-action")).to_be_disabled()
    expect(page.locator("#primary-action")).to_have_text("Pausa standard già applicata")

    page.evaluate("__advanceClock(2 * 60 * 1000)")
    alpha = page.locator("#today-allocation-list .allocation-row", has_text="ALFA")
    beta = page.locator("#today-allocation-list .allocation-row", has_text="BETA")
    expect(alpha).to_contain_text("2:02")
    expect(beta).to_contain_text("1:15")
    expect(page.locator("#today-allocation-copy")).to_contain_text("3:17 allocate")

    page.locator('.nav-item[data-target="calendar"]').click()
    expect(page.locator(".calendar-day.today .project-dot")).to_have_text("3:17")
    page.locator('.nav-item[data-target="summary"]').click()
    expect(page.locator("#summary-projects-total")).to_have_text("3:17")
    context.close()


def scenario_settings_fallback_and_invites(browser, url):
    seed = base_seed([], break_time=None)
    seed["profile"]["family_settings"].pop("automatic_break_time", None)
    sharing = {
        "space": {"id": "space-1", "is_enabled": True}, "settings": {}, "members": [],
        "invitations": [{"id": "invite-1", "invitee_email": "mario@example.test", "status": "pending"}]
    }
    context, page = open_build(browser, url, seed, f"{DATE}T10:00:00+01:00", sharing)
    page.locator('.nav-item[data-target="settings"]').click()
    expect(page.locator("#automatic-break-time")).to_have_value("13:00")
    page.locator("#automatic-break-time").fill("14")
    page.locator("#automatic-break-time").press("Tab")
    expect(page.locator("#automatic-break-time")).to_have_value("14:00")
    page.locator("#settings-form button", has_text="Salva le impostazioni").click()
    page.wait_for_timeout(100)
    page.locator('.nav-item[data-target="today"]').click()
    page.locator('.nav-item[data-target="settings"]').click()
    expect(page.locator("#automatic-break-time")).to_have_value("14:00")
    page.locator("#calendar-sharing-settings > summary").click()
    expect(page.locator("#calendar-sharing-settings-root .sharing-status.pending")).to_have_text("In attesa")
    expect(page.locator("#calendar-sharing-settings-root button", has_text="Annulla invito")).to_be_visible()

    page.locator("#invite-email").fill("mario@example.test")
    page.locator("#invite-form button[type=submit]").click()
    page.wait_for_timeout(100)
    assert page.locator("#calendar-sharing-settings-root strong", has_text="mario@example.test").count() == 1
    assert page.evaluate("__inviteCalls()") == 0

    page.evaluate("__setInviteStatus('rejected')")
    page.locator("#calendar-sharing-settings > summary").click()
    page.locator("#calendar-sharing-settings > summary").click()
    expect(page.locator("#calendar-sharing-settings-root .sharing-status.rejected")).to_have_text("Rifiutato")

    page.reload(wait_until="networkidle")
    page.wait_for_function("window.__CHRONO_FLOW_E2E__?.ready === true")
    page.locator('.nav-item[data-target="settings"]').click()
    page.locator("#calendar-sharing-settings > summary").click()
    expect(page.locator("#calendar-sharing-settings-root .sharing-status.rejected")).to_have_text("Rifiutato")

    page.evaluate("__setInviteStatus('accepted')")
    page.locator("#calendar-sharing-settings > summary").click()
    page.locator("#calendar-sharing-settings > summary").click()
    expect(page.locator("#calendar-sharing-settings-root .sharing-status.active").first).to_have_text("Attivo")
    expect(page.locator("#calendar-sharing-settings-root button", has_text="Revoca accesso")).to_be_visible()
    context.close()


def main():
    port = free_port()
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    url = f"http://127.0.0.1:{port}/"
    try:
        for _ in range(50):
            try:
                urlopen(url, timeout=0.2).close(); break
            except Exception:
                time.sleep(0.05)
        with sync_playwright() as playwright:
            browser = launch_chromium(playwright)
            scenario_register_and_single_edit(browser, url)
            scenario_live_allocations_pause_and_views(browser, url)
            scenario_settings_fallback_and_invites(browser, url)
            browser.close()
        print("E2E DOM reale 3.3.5: 3 scenari integrati superati")
        print("- Registra attività: nessuna preselezione, ricerca multipla, reset/focus, editor singolo")
        print("- Timer/pausa 12:45-13:15: percentuali live, stop/ripresa, manuale 1:15, Home/Calendario/Riepilogo")
        print("- Fallback 13:00 e inviti persistenti: In attesa/Rifiutato/Attivo, deduplica, refresh PWA")
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
