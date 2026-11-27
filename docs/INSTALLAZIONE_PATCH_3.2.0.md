# Installazione patch Chrono Flow 3.2.0 sopra la build corrente

## Importante

Lo ZIP contiene i file **direttamente alla radice**, non dentro una cartella wrapper. I percorsi `index.html`, `styles.css`, `src/…` e `sw…` devono sovrascrivere quelli presenti nella root pubblicata da GitHub Pages.

## Procedura

1. Crea un backup o branch della repository corrente.
2. Estrai lo ZIP.
3. Carica **il contenuto** nella root del branch pubblicato da GitHub Pages, mantenendo i percorsi.
4. Verifica in particolare che siano stati sostituiti:
   - `index.html`;
   - `styles.css`;
   - `src/app.js`;
   - `src/app.mjs`;
   - `src/app.v3.0.5.mjs`;
   - `sw.js`;
   - `sw.v3.0.5.js`;
   - `sw.v3.1.0.js`.
5. Verifica che siano stati aggiunti:
   - `src/app.v3.2.0.mjs`;
   - `src/stale-shell-recovery.v3.2.0.mjs`;
   - `sw.v3.2.0.js`.
6. Non modificare `src/config.js`.
7. Non eseguire SQL e non rieseguire la migration calendario.
8. Non modificare RLS, tabelle o dati.

## Verifica repository prima del deploy

Aprendo `index.html` su GitHub devono comparire entrambe le stringhe:

```html
data-chrono-flow-ui="2.9.4-restored"
src="src/app.v3.2.0.mjs"
```

Se si vede ancora `<main id="app">` con i pulsanti header `Oggi / Calendario / Esci`, il file root non è stato sovrascritto.

## Test

```bash
npm run check
```

Risultato atteso: `155 pass`, `0 fail`.

Per ripetere i render test è necessario Python con Playwright e Chromium:

```bash
python3 tests/render_ui.py tests/render-output
```

## Primo avvio

1. Attendi il completamento del deploy Pages.
2. Chiudi tutte le schede e la PWA.
3. Riapri l’app.
4. Le vecchie entry 3.0.x e i vecchi worker inoltrano automaticamente alla build `?ui=3.2.0` e sostituiscono la cache.
5. Se la PWA era rimasta aperta durante il deploy, chiudila e riaprila una seconda volta per consentire l’attivazione del nuovo worker.

## Smoke test

- apertura/login/reload → Oggi;
- bottom navigation con quattro voci;
- Profilo/account in alto;
- Home con card grande;
- Calendario → Il mio predefinito;
- Calendario → Condivisi → persona e Confronta;
- Impostazioni → Condivisione calendario con inviti/privacy/revoca;
- Riepilogo completo;
- Smart senza straordinario → uscita automatica, nessun pulsante uscita;
- Smart con straordinario → uscita manuale e straordinario realtime.
