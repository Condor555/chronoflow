# Manifest Chrono Flow 3.3.6

Build completa con pass di compatibilità mobile/iPhone.

## File nuovi

- `src/app.v3.3.6.mjs`
- `sw.v3.3.6.js`
- `tests/mobile-compatibility-v3.3.6.test.mjs`
- `docs/NOTE_RILASCIO_3.3.6.md`

## File aggiornati

- `index.html`
- `styles.css`
- `src/app.js`
- `src/calculations.mjs`
- `sw.js`
- `package.json`

## Dati e backend

- nessuna migrazione SQL;
- nessuna eliminazione di dati;
- `src/config.js` conservato dal materiale fornito;
- orario pausa salvato nel JSON `family_settings.pause_start_time` con fallback `13:00`.

## Installazione

Sovrascrivere la repository mantenendo i percorsi, attendere GitHub Pages, quindi chiudere e riaprire completamente la PWA.
