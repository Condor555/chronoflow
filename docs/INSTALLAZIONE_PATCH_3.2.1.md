# Installazione patch Chrono Flow 3.2.1 sopra 3.2.0

## Contenuto

La patch contiene esclusivamente file nuovi o modificati rispetto alla 3.2.0. I file sono direttamente alla radice dello ZIP.

## Procedura

1. Crea un backup o branch della build 3.2.0.
2. Estrai lo ZIP.
3. Carica il contenuto nella root pubblicata da GitHub Pages, mantenendo tutti i percorsi.
4. Consenti la sovrascrittura di `index.html`, `styles.css`, entry point e worker.
5. Verifica che siano presenti:
   - `src/app.v3.2.1.mjs`;
   - `src/stale-shell-recovery.v3.2.1.mjs`;
   - `sw.v3.2.1.js`.
6. Non modificare `src/config.js`.
7. Non eseguire SQL e non modificare migration/RLS o dati.

## Verifica

```bash
npm run check
```

Risultato atteso: `164 pass`, `0 fail`.

Per rigenerare gli screenshot:

```bash
python3 tests/render_ui.py tests/render-output
```

## Smoke test

- Home Smart: gradiente profondo e decorazione circolare;
- Smart senza straordinario: `Uscita automatica alle …`, nessun pulsante uscita;
- Impostazioni: otto macro-card;
- apertura di una macro: ogni altra macro si chiude;
- apertura su mobile: focus e scroll coerenti;
- salvataggio: valori invariati;
- Condivisione: invito vuoto mostra errore inline, senza tooltip browser;
- Riepilogo continua a rispettare causali e preferenze configurate.

## Aggiornamento PWA

Il nuovo worker `sw.v3.2.1.js` aggiorna CSS e entry point con URL versionati. Dopo il deploy chiudi tutte le schede e la PWA, quindi riapri. I worker precedenti delegano automaticamente alla 3.2.1.
