# PATCH manifest — Chrono Flow 3.0.5 → 3.1.0

La patch contiene esclusivamente file nuovi o modificati rispetto alla 3.0.5 ricostruita dalle hotfix ufficiali.

## Garanzie

- `src/config.js` escluso e invariato.
- Nessun file SQL incluso o modificato.
- Nessuna modifica a RLS, tabelle o dati.
- Moduli Calendar 3.0.5 mantenuti e caricati in modo lazy.
- Service worker 3.1 network-first con pulizia cache precedenti.
- Suite: 136 test superati, 0 errori.

## File nuovi (26)

- `.nojekyll`
- `docs/CALCULATION_RULES.md`
- `docs/INSTALLAZIONE_PATCH_3.1.0.md`
- `docs/RESTORATION_AUDIT_2.9.4_TO_3.0.5.md`
- `docs/UX_AUDIT.md`
- `icons/apple-touch-icon.png`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/icon-maskable-512.png`
- `icons/icon-maskable.svg`
- `icons/icon.svg`
- `src/app.js`
- `src/calculations.mjs`
- `src/live-clock.mjs`
- `src/migration.mjs`
- `src/pwa-install.mjs`
- `src/smart-auto-exit.mjs`
- `sw.v3.1.0.js`
- `tests/calculations.test.mjs`
- `tests/home-display.test.mjs`
- `tests/live-clock.test.mjs`
- `tests/migration.test.mjs`
- `tests/pwa-install.test.mjs`
- `tests/smart-auto-exit.test.mjs`
- `tests/ui-audit.test.mjs`
- `tests/ui-restoration-v3.1.0.test.mjs`

## File modificati (16)

- `CHANGELOG.md`
- `PATCH_MANIFEST.md`
- `README.md`
- `SHA256SUMS`
- `index.html`
- `manifest.webmanifest`
- `package.json`
- `src/calendar-sharing-view.v3.0.5.mjs`
- `src/home-display.mjs`
- `styles.css`
- `tests/bootstrap-config-2.9.4.test.mjs`
- `tests/home-theme.browser.html`
- `tests/home-theme.test.mjs`
- `tests/import-graph-v3.0.5.test.mjs`
- `tests/service-worker-reload.test.mjs`
- `tests/service-worker-v3.0.5.test.mjs`

## Installazione

Vedi `docs/INSTALLAZIONE_PATCH_3.1.0.md`.

## Audit

Vedi `docs/RESTORATION_AUDIT_2.9.4_TO_3.0.5.md`.
