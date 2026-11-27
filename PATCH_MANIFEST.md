# PATCH manifest — Chrono Flow build corrente → 3.2.0

La patch contiene esclusivamente file nuovi o modificati rispetto alla build corrente 3.1.0. Lo ZIP espone i file direttamente alla radice.

## Garanzie vincolanti

- `src/config.js` escluso e verificato byte-per-byte invariato.
- `supabase/migrations/20261126_001_calendar_sharing.sql` esclusa e verificata byte-per-byte invariata.
- Nessuna modifica a SQL, RLS, tabelle o dati.
- La migration 3.0.0 è stata verificata additiva rispetto a `work_days` e `profiles`.
- La regressione grafica è trattata come problema frontend/bootstrap, non database.
- 155 test automatici superati.
- Render test superati a 390 × 844 e 1440 × 1000; Home standard pixel-identica alla 2.9.4.

## Classificazione architetturale

### A. File ripristinati dalla 2.9.4 come sorgente visiva

- `index.html` — DOM completo, quattro sezioni, Profilo/account, Home e calendario personale.
- `styles.css` — CSS 2.9.4 mantenuto come prefisso autorevole; solo estensioni native aggiunte in coda.
- `src/app.js` — motore completo 2.9.x sotto la shell ripristinata, con integrazioni post-2.9.4.
- `tests/render-output/baseline-*.png` — riferimento render 2.9.4.

### B. File 3.x mantenuti per stabilità/bootstrap

- `src/app.mjs`, `src/app.v3.0.5.mjs` — shim per shell obsolete.
- `src/app.v3.2.0.mjs` — entry point immutabile finale.
- `src/stale-shell-recovery.v3.2.0.mjs` — navigazione cache-busted dalla shell minimale.
- `sw.js`, `sw.v3.0.5.js`, `sw.v3.1.0.js`, `sw.v3.2.0.js` — convergenza cache e worker network-first.
- test bootstrap, import graph, service worker, record null e migration additiva.

### C. File/incrementi per condivisione calendario

- `src/calendar-sharing-view.v3.0.5.mjs` — vista mensile, selezione persona, confronto e gestione embedded.
- `index.html`, `styles.css`, `src/app.js` — `Il mio / Condivisi` e card Impostazioni progressive disclosure.
- `tests/post-294-non-regression.test.mjs` e render Condivisi/Impostazioni.

### D. Funzioni post-2.9.4 preservate

Il motore Smart automatico, Smart con straordinario, genitorialità, ferie/riporti/recuperi, buoni pasto, riclassificazione storico, notifiche e PWA sono verificati dalla matrice e dalla suite. Non sono stati sostituiti con una copia funzionalmente ridotta della 2.9.4.

## File nuovi (25)

- `docs/FINAL_UI_RESTORATION_3.2.0.md`
- `docs/FUNCTIONAL_MATRIX_2.9.4_CURRENT.md`
- `docs/INSTALLAZIONE_PATCH_3.2.0.md`
- `src/app.v3.2.0.mjs`
- `src/stale-shell-recovery.v3.2.0.mjs`
- `sw.v3.2.0.js`
- `tests/additive-migration.test.mjs`
- `tests/authoritative-shell-bootstrap.test.mjs`
- `tests/final-test-report.txt`
- `tests/post-294-non-regression.test.mjs`
- `tests/render-output/baseline-desktop-today.png`
- `tests/render-output/baseline-mobile-today.png`
- `tests/render-output/current-desktop-calendar-shared.png`
- `tests/render-output/current-desktop-calendar.png`
- `tests/render-output/current-desktop-settings.png`
- `tests/render-output/current-desktop-today-auto-exit.png`
- `tests/render-output/current-desktop-today.png`
- `tests/render-output/current-mobile-calendar-shared.png`
- `tests/render-output/current-mobile-calendar.png`
- `tests/render-output/current-mobile-settings-sharing.png`
- `tests/render-output/current-mobile-summary.png`
- `tests/render-output/current-mobile-today-auto-exit.png`
- `tests/render-output/current-mobile-today.png`
- `tests/render-output/render-report.json`
- `tests/render_ui.py`

## File modificati (21)

- `CHANGELOG.md`
- `PATCH_MANIFEST.md`
- `README.md`
- `SHA256SUMS`
- `index.html`
- `package.json`
- `src/app.js`
- `src/app.mjs`
- `src/app.v3.0.5.mjs`
- `src/calendar-sharing-view.v3.0.5.mjs`
- `styles.css`
- `sw.js`
- `sw.v3.0.5.js`
- `sw.v3.1.0.js`
- `tests/bootstrap-config-2.9.4.test.mjs`
- `tests/import-graph-v3.0.5.test.mjs`
- `tests/service-worker-reload.test.mjs`
- `tests/service-worker-v3.0.5.test.mjs`
- `tests/today-loading.test.mjs`
- `tests/ui-audit.test.mjs`
- `tests/ui-restoration-v3.1.0.test.mjs`

## File esplicitamente esclusi

- `src/config.js`
- `supabase/migrations/20261126_001_calendar_sharing.sql`
- ogni altro file SQL/RLS o dato
