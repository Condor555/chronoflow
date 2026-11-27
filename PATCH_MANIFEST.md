# Manifest patch Chrono Flow 3.3.0

**Baseline richiesta:** Chrono Flow 3.2.2 stabile  
**Tipo:** patch incrementale, solo file nuovi o modificati  
**Funzione:** gestione commesse opzionale con allocazioni multiple per giornata

## Riepilogo

- **31 file** nella patch;
- **16 file modificati** rispetto alla 3.2.2;
- **15 file nuovi**;
- `src/config.js` escluso.

## File modificati

- `PATCH_MANIFEST.md`
- `SHA256SUMS`
- `index.html`
- `package.json`
- `src/app.js`
- `styles.css`
- `sw.js`
- `tests/authoritative-shell-bootstrap.test.mjs`
- `tests/fixtures/settings-controls-3.2.0.json`
- `tests/import-graph-v3.0.5.test.mjs`
- `tests/post-294-non-regression.test.mjs`
- `tests/service-worker-reload.test.mjs`
- `tests/service-worker-v3.0.5.test.mjs`
- `tests/settings-accordion.test.mjs`
- `tests/ui-audit.test.mjs`
- `tests/ui-restoration-v3.1.0.test.mjs`

## File nuovi runtime e database

- `src/app.v3.3.0.mjs`
- `sw.v3.3.0.js`
- `supabase/migrations/20261127_330_projects_allocations.sql`

## Documentazione nuova

- `docs/COMMESSE_3.3.0.md`
- `docs/INSTALLAZIONE_PATCH_3.3.0.md`

## Test e prove nuove

- `tests/projects-feature.test.mjs`
- `tests/verify_projects_ui.py`
- `tests/render-output-3.3.0/baseline-disabled-desktop.png`
- `tests/render-output-3.3.0/baseline-disabled-mobile.png`
- `tests/render-output-3.3.0/current-disabled-desktop.png`
- `tests/render-output-3.3.0/current-disabled-mobile.png`
- `tests/render-output-3.3.0/projects-home-desktop.png`
- `tests/render-output-3.3.0/projects-home-mobile.png`
- `tests/render-output-3.3.0/projects-settings-mobile.png`
- `tests/render-output-3.3.0/verification-report.json`

## Esclusioni garantite

- `src/config.js` non è presente nella patch e non viene modificato.
- Nessun dato esistente viene modificato o cancellato.
- Nessun `project_id` viene aggiunto a `work_days`.
- Le commesse non entrano nei KPI principali del Riepilogo.

## Verifiche eseguite

- sintassi JavaScript: superata;
- ID DOM duplicati: 0;
- suite applicabile baseline + feature: **140/140 test superati**;
- test specifici commesse: **7/7 superati**;
- verifica responsive mobile 390 px e desktop 1440 px: nessun overflow;
- target interattivi della feature: almeno 44 px;
- parità visiva con 3.2.2 a funzione disattivata: differenza pixel **0,00%** su mobile e desktop;
- accordion Impostazioni: una sola macro-sezione aperta nella prova visuale;
- migration: additiva, RLS attiva e ownership composta su commesse/allocazioni.

Consultare `docs/INSTALLAZIONE_PATCH_3.3.0.md` prima dell’applicazione.
