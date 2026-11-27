# PATCH manifest — Chrono Flow 3.2.0 → 3.2.1

Patch incrementale con soli file nuovi o modificati rispetto alla build corrente 3.2.0. I file sono direttamente alla radice dello ZIP.

## Garanzie

- `src/config.js` escluso e byte-per-byte invariato.
- SQL, migration, RLS e dati esclusi e invariati.
- Nessun controllo o logica funzionale rimosso.
- Contratto Impostazioni: 52 controlli dati prima e dopo il refactor.
- 164 test automatici, 0 errori.
- Render Chromium superati a 390 × 844 e 1440 × 1000.

## Intervento Home

- `styles.css`: gradienti profondi per Ufficio/Smart/Trasferta, decorazione circolare soft, pill e CTA integrate.
- Smart automatica: la microcopy `Uscita automatica alle HH:MM` resta dentro la card e `Registra uscita` resta assente.
- Test contrasto WCAG AA su entrambi gli estremi di ogni gradiente.

## Intervento Impostazioni

- `index.html`: otto macro-sezioni e sottosezioni Avanzate; tutti gli ID dei controlli conservati.
- `src/app.js`: accordion single-open, ARIA, focus/scroll mobile, apertura automatica della macro con controllo invalido e sintesi aggiornate.
- `src/calendar-sharing-view.v3.0.5.mjs`: salvataggio generale separato dall’invito; validazione invito inline; label ON/OFF dinamica; inviti e permessi nascosti quando la condivisione è disattivata, senza cancellare accessi o inviti esistenti.
- `tests/fixtures/settings-controls-3.2.0.json`: contratto dei 52 controlli pre-refactor.
- `tests/settings-accordion.test.mjs`: architettura, single-open, conservazione dati, indipendenza tra salvataggio generale/invito e stato Condivisione OFF.

## Bootstrap/cache

- Entry point e worker 3.2.1 con URL versionati per assicurare l’aggiornamento CSS su PWA e browser.
- Entry/worker precedenti delegano alla 3.2.1.

## File nuovi (10)

- `docs/HOME_SETTINGS_UX_3.2.1.md`
- `docs/INSTALLAZIONE_PATCH_3.2.1.md`
- `src/app.v3.2.1.mjs`
- `src/stale-shell-recovery.v3.2.1.mjs`
- `sw.v3.2.1.js`
- `tests/fixtures/settings-controls-3.2.0.json`
- `tests/render-output/current-mobile-settings.png`
- `tests/render-output/current-mobile-settings-sharing-off.png`
- `tests/render-output/home-theme-browser.png`
- `tests/settings-accordion.test.mjs`

## File modificati (36)

- `CHANGELOG.md`
- `PATCH_MANIFEST.md`
- `README.md`
- `SHA256SUMS`
- `docs/FUNCTIONAL_MATRIX_2.9.4_CURRENT.md`
- `index.html`
- `package.json`
- `src/app.js`
- `src/app.mjs`
- `src/app.v3.0.5.mjs`
- `src/app.v3.2.0.mjs`
- `src/calendar-sharing-view.v3.0.5.mjs`
- `styles.css`
- `sw.js`
- `sw.v3.0.5.js`
- `sw.v3.1.0.js`
- `sw.v3.2.0.js`
- `tests/authoritative-shell-bootstrap.test.mjs`
- `tests/bootstrap-config-2.9.4.test.mjs`
- `tests/final-test-report.txt`
- `tests/home-theme.browser.html`
- `tests/home-theme.test.mjs`
- `tests/import-graph-v3.0.5.test.mjs`
- `tests/post-294-non-regression.test.mjs`
- `tests/render-output/current-desktop-settings.png`
- `tests/render-output/current-desktop-today-auto-exit.png`
- `tests/render-output/current-desktop-today.png`
- `tests/render-output/current-mobile-settings-sharing.png`
- `tests/render-output/current-mobile-today-auto-exit.png`
- `tests/render-output/current-mobile-today.png`
- `tests/render-output/render-report.json`
- `tests/render_ui.py`
- `tests/service-worker-reload.test.mjs`
- `tests/service-worker-v3.0.5.test.mjs`
- `tests/ui-audit.test.mjs`
- `tests/ui-restoration-v3.1.0.test.mjs`

## File esclusi

- `src/config.js`
- `supabase/**`
- dati utente
