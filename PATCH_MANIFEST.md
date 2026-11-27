# Manifest patch Chrono Flow 3.3.1

**Baseline richiesta:** Chrono Flow 3.3.0 stabile  
**Tipo:** patch incrementale, esclusivamente file nuovi o modificati rispetto alla 3.3.0  
**Obiettivo:** miglioramento Commesse, persistenza modalità Home/Calendario e ripristino modifica Calendario personale

## File modificati

- `PATCH_MANIFEST.md`
- `SHA256SUMS`
- `index.html`
- `package.json`
- `src/app.js`
- `styles.css`
- `sw.js`
- `tests/authoritative-shell-bootstrap.test.mjs`
- `tests/bootstrap-config-2.9.4.test.mjs`
- `tests/import-graph-v3.0.5.test.mjs`
- `tests/projects-feature.test.mjs`
- `tests/ui-restoration-v3.1.0.test.mjs`

## File nuovi runtime

- `src/app.v3.3.1.mjs`
- `src/day-source-of-truth.mjs`
- `src/project-allocation-policy.mjs`
- `sw.v3.3.1.js`

## Migration additiva nuova

- `supabase/migrations/20261127_331_allocation_method.sql`

La migration aggiunge soltanto `work_allocations.allocation_method`, con default `hours`. Non modifica `work_days`, non elimina dati e non cambia le RLS 3.3.0.

## Test nuovi

- `tests/critical-regressions-v3.3.1.test.mjs`
- `tests/day-source-of-truth.test.mjs`
- `tests/project-allocation-policy.test.mjs`

## Documentazione nuova

- `docs/INSTALLAZIONE_PATCH_3.3.1.md`
- `docs/NOTE_RILASCIO_3.3.1.md`
- `docs/TEST_REPORT_3.3.1.md`

## Esclusioni garantite

- `src/config.js` non è incluso e non viene modificato.
- La migration 3.3.0 non viene ripetuta o modificata.
- Nessun dato esistente viene cancellato.
- Nessun file completo non necessario della baseline è incluso.
- Il Calendario condiviso resta in sola lettura.

## Verifiche

- sintassi JavaScript: superata;
- suite completa ricostruita: **189/189**;
- suite focalizzata 3.3.1: **24/24**;
- verifica Chromium mobile 390×844 e desktop 1440×1000: superata;
- nessun overflow orizzontale nel dialog Commesse;
- cache PWA versionata a `chrono-flow-v3.3.1-projects-mode-calendar`.

Seguire `docs/INSTALLAZIONE_PATCH_3.3.1.md` prima di applicare la patch.
