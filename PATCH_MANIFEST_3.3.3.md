# Manifest patch Chrono Flow 3.3.3

**Baseline reale:** `CHRONO_FLOW_REPO_SNAPSHOT.txt`, build 3.3.2, generato il 2026-11-27 alle 15:53:35  
**Tipo:** patch incrementale; contiene esclusivamente file nuovi o modificati rispetto allo snapshot  
**Obiettivo:** correggere i flussi completi senza ridisegnare o sostituire le funzioni già operative

## File da caricare su GitHub

Caricare questi file mantenendo esattamente i percorsi indicati e sovrascrivendo solo quelli già esistenti:

### File modificati

- `CHANGELOG.md`
- `index.html`
- `package.json`
- `src/app.js`
- `src/calculations.mjs`
- `src/day-source-of-truth.mjs`
- `src/project-allocation-policy.mjs`
- `sw.js`
- `tests/authoritative-shell-bootstrap.test.mjs`
- `tests/bootstrap-config-2.9.4.test.mjs`
- `tests/critical-regressions-v3.3.1.test.mjs`
- `tests/day-source-of-truth.test.mjs`
- `tests/import-graph-v3.0.5.test.mjs`
- `tests/projects-feature.test.mjs`
- `tests/ui-restoration-v3.1.0.test.mjs`

### File nuovi

- `PATCH_MANIFEST_3.3.3.md`
- `docs/INSTALLAZIONE_PATCH_3.3.3.md`
- `docs/TEST_REPORT_3.3.3.md`
- `src/app.v3.3.3.mjs`
- `sw.v3.3.3.js`
- `tests/critical-regressions-v3.3.3.test.mjs`
- `tests/full-user-flows.test.mjs`

## File da non rimuovere o sostituire

Tutti gli altri file della repository, incluse le entry e i service worker versionati precedenti, devono restare presenti. In particolare non cancellare `src/app.v3.3.2.mjs` o `sw.v3.3.2.js`: la patch aggiunge la nuova versione immutabile e aggiorna soltanto i puntatori correnti.

## Supabase

**Non serve alcuna nuova modifica Supabase.** La patch non contiene SQL e non modifica schema, RLS o dati.

Per usare Commesse devono essere già presenti le migration incluse nella baseline 3.3.2:

- `supabase/migrations/20261127_330_projects_allocations.sql`
- `supabase/migrations/20261127_331_allocation_method.sql`

Se la funzione Commesse funzionava già sulla build 3.3.2, non eseguire nulla in Supabase.

## Verifica richiesta dopo il deploy

```bash
npm run check
npm test
```

Risultato ottenuto sulla patch consegnata:

- controllo mirato e flussi completi: **66/66 superati**;
- suite completa: **211/211 superati**.
