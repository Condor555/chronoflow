#!/usr/bin/env python3
"""Real-browser regression for Home source-of-truth and personal Calendar editing."""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json
import shutil
import socket
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
CHROMIUM = "/opt/pw-browsers/chromium-current/chrome-linux64/chrome"

FAKE_SUPABASE = r"""
const USER = { id: 'user-e2e', email: 'fabrizio@example.test', user_metadata: { display_name: 'Fabrizio' } };
const DEFAULT_PROFILE = { id: USER.id, display_name: 'Fabrizio', target_minutes: 456,
  office_break_minutes: 30, smart_break_minutes: 30, travel_break_minutes: 30,
  overtime_threshold: 10, ticket_office: true, ticket_smart: true, ticket_travel: true,
  timezone: 'Europe/Rome', family_settings: { children: [], work_modes: { office:true, smart:true, travel:true, saturday:true },
  absence_features:{vacation:true,sickness:true,marriage_leave:true,recovery:true},
  summary_preferences:{show_distribution:true,show_annual_table:true}, overtime_settings:{smart:false,travel:false},
  projects_enabled:false, default_project_id:null, contract_settings:{sunday_holiday_rule:'none',sunday_holiday_adjustments:{},
  local_holiday:null,leave_settings:{default_vacation_days:20,default_suppressed_holiday_days:4,years:{}}} } };
function db(){ try { return JSON.parse(localStorage.getItem('e2e-db') || '{}'); } catch { return {}; } }
function save(value){ localStorage.setItem('e2e-db', JSON.stringify(value)); }
function rowsFor(table){ const store=db(); if(table==='profiles') return [store.profile || DEFAULT_PROFILE]; return Array.isArray(store[table]) ? store[table] : []; }
function writeRows(table, rows){ const store=db(); if(table==='profiles') store.profile=rows[0] || null; else store[table]=rows; save(store); }
class Query {
  constructor(table){ this.table=table; this.op='select'; this.filters=[]; this.payload=null; this.wantSingle=false; }
  select(){ return this; }
  eq(k,v){ this.filters.push(row=>row?.[k]===v); return this; }
  gte(k,v){ this.filters.push(row=>String(row?.[k]||'')>=String(v)); return this; }
  lte(k,v){ this.filters.push(row=>String(row?.[k]||'')<=String(v)); return this; }
  in(k,vals){ this.filters.push(row=>vals.includes(row?.[k])); return this; }
  order(){ return this; }
  maybeSingle(){ this.wantSingle='maybe'; return this; }
  single(){ this.wantSingle='single'; return this; }
  upsert(payload){ this.op='upsert'; this.payload=payload; return this; }
  delete(){ this.op='delete'; return this; }
  async execute(){
    let rows=rowsFor(this.table);
    if(this.op==='upsert'){
      const incoming=Array.isArray(this.payload)?this.payload:[this.payload];
      for(const item of incoming){
        const keys=this.table==='work_days'?['user_id','work_date']:['id'];
        const idx=rows.findIndex(row=>keys.every(k=>row?.[k]===item?.[k]));
        const saved={...(idx>=0?rows[idx]:{}),...item};
        if(idx>=0) rows[idx]=saved; else rows.push(saved);
      }
      writeRows(this.table,rows);
      rows=incoming.map(item=>rows.find(row=>(this.table==='work_days'?row.user_id===item.user_id&&row.work_date===item.work_date:row.id===item.id)));
    } else if(this.op==='delete') {
      const matched=rows.filter(row=>this.filters.every(fn=>fn(row)));
      rows=rows.filter(row=>!this.filters.every(fn=>fn(row))); writeRows(this.table,rows); rows=matched;
    } else rows=rows.filter(row=>this.filters.every(fn=>fn(row)));
    return {data:this.wantSingle?(rows[0]??null):rows,error:null};
  }
  then(resolve,reject){ return this.execute().then(resolve,reject); }
}
export function readSupabaseConfig(){ return {url:'https://e2e.supabase.co',publishableKey:'e2e'}; }
export function hasSupabaseConfig(){ return true; }
export function createConfiguredSupabaseClient(){ return supabase; }
export const supabase={
 auth:{ onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}, async getSession(){return {data:{session:{user:USER}},error:null}}, async signOut(){return {error:null}}, async resetPasswordForEmail(){return {error:null}} },
 from(table){ return new Query(table); }
};
"""


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


with TemporaryDirectory(prefix="chrono-flow-e2e-") as temporary:
    app = Path(temporary) / "app"
    shutil.copytree(ROOT, app, ignore=shutil.ignore_patterns("node_modules", "render-output*"))
    (app / "src" / "supabase-client.v3.0.3.mjs").write_text(FAKE_SUPABASE)
    port = free_port()
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=app, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(0.4)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, executable_path=CHROMIUM, args=["--no-sandbox"])
            page = browser.new_page(viewport={"width": 390, "height": 844}, locale="it-IT", timezone_id="Europe/Rome")
            seed = {
                "profile": {"id":"user-e2e","display_name":"Fabrizio","target_minutes":456,"office_break_minutes":30,"smart_break_minutes":30,"travel_break_minutes":30,"overtime_threshold":10,"ticket_office":True,"ticket_smart":True,"ticket_travel":True,"timezone":"Europe/Rome","family_settings":{"children":[],"work_modes":{"office":True,"smart":True,"travel":True,"saturday":True},"absence_features":{"vacation":True,"sickness":True,"marriage_leave":True,"recovery":True},"summary_preferences":{"show_distribution":True,"show_annual_table":True},"overtime_settings":{"smart":False,"travel":False},"projects_enabled":True,"default_project_id":"p1","contract_settings":{"sunday_holiday_rule":"none","sunday_holiday_adjustments":{},"local_holiday":None,"leave_settings":{"default_vacation_days":20,"default_suppressed_holiday_days":4,"years":{}}}}},
                "work_days": [{"user_id":"user-e2e","work_date":"__TODAY__","planned_type":"smart","actual_type":"office","absence_type":None,"child_id":None,"events":[],"ticket_override":None,"notes":"seed"}],
                "work_projects": [{"id":"p1","user_id":"user-e2e","code":"C001","description":"Test","is_active":True}],
                "work_allocations": [{"id":"a1","user_id":"user-e2e","project_id":"p1","work_date":"__TODAY__","start_time":None,"end_time":None,"duration_minutes":456,"allocation_method":"automatic","note":""}]
            }
            seed_json = json.dumps(seed)
            page.add_init_script(f"const seed={seed_json}; const today=new Date().toLocaleDateString('sv-SE',{{timeZone:'Europe/Rome'}}); seed.work_days[0].work_date=today; seed.work_allocations[0].work_date=today; localStorage.setItem('e2e-db',JSON.stringify(seed));")
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{port}/index.html", wait_until="networkidle")
            page.wait_for_selector("#app-shell:not([hidden])")
            assert page.locator("#work-timer-card").get_attribute("data-mode") == "smart"
            page.reload(wait_until="networkidle")
            page.wait_for_selector("#app-shell:not([hidden])")
            assert page.locator("#work-timer-card").get_attribute("data-mode") == "smart"

            page.locator('[data-target="calendar"]').click()
            page.locator(".calendar-day.today").click()
            assert page.locator("#day-dialog").evaluate("dialog => dialog.open")
            assert page.locator("#day-projects-field").is_visible()
            page.locator("#day-planned-type").select_option("travel")
            page.locator("#day-actual-type").select_option("travel")
            page.locator("#day-entry-time").fill("08:00")
            page.locator("#day-pause-start-time").fill("12:00")
            page.locator("#day-pause-end-time").fill("13:00")
            page.locator("#day-exit-time").fill("17:00")
            page.locator("#day-notes").fill("Modifica completa E2E")
            page.locator('#day-form button[type="submit"]').click()
            page.wait_for_timeout(250)
            assert not page.locator("#day-dialog").evaluate("dialog => dialog.open")

            page.locator('[data-target="today"]').click()
            assert page.locator("#work-timer-card").get_attribute("data-mode") == "travel"
            stored = page.evaluate("JSON.parse(localStorage.getItem('e2e-db'))")
            day = stored["work_days"][0]
            assert len(stored["work_days"]) == 1
            assert day["planned_type"] == day["actual_type"] == "travel"
            assert [event["type"] for event in day["events"] if not event.get("superseded")] == ["entry", "pause", "resume", "exit"]
            assert day["notes"] == "Modifica completa E2E"
            assert not errors, errors
            browser.close()
            print(json.dumps({"home_reopen":"smart","calendar_edit":"travel","work_days":1,"events":4,"projects_visible":True,"page_errors":0}, ensure_ascii=False))
    finally:
        server.terminate()
        server.wait()
