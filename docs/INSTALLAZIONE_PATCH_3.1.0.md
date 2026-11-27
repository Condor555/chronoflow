# Installazione patch Chrono Flow 3.1.0 sopra 3.0.5

## Prima di iniziare

1. Crea un backup o un branch della repository 3.0.5.
2. Verifica che la 3.0.5 funzioni e che la migrazione calendario sia già stata applicata.
3. Non modificare `src/config.js`.

## Applicazione

1. Estrai la patch nella root della repository.
2. Sovrascrivi i file esistenti mantenendo i percorsi.
3. Aggiungi i file nuovi, inclusi `src/app.js`, i moduli 2.9.4 ripristinati, le icone e `sw.v3.1.0.js`.
4. Non eliminare i moduli 3.0.5 già presenti: il nuovo bootstrap usa ancora i moduli Calendar versionati.
5. Non eseguire SQL o migrazioni.
6. Non modificare RLS, tabelle o dati.

## Verifica locale

```bash
npm test
npm run check
```

Il risultato atteso è `136 pass`, `0 fail`.

## Deploy

1. Esegui commit e attendi GitHub Pages.
2. Chiudi tutte le schede e la PWA installata.
3. Riapri Chrono Flow. Se necessario, esegui una sola volta un refresh forzato.
4. Il nuovo worker `sw.v3.1.0.js` elimina le cache precedenti e usa network-first per HTML, JavaScript e CSS.

## Smoke test

- login/reload/riapertura → **Oggi**;
- bottom navigation → **Oggi, Calendario, Riepilogo, Impostazioni**;
- Profilo/account → nome, email e logout;
- Oggi → grande card e tre modalità con colori corretti;
- Calendario → **Il mio** mantiene pianificazione e modifica giornata;
- Calendario → **Condivisi** carica inviti, persone e confronto senza bloccare l’app;
- Riepilogo → mese, saldi, dettagli e genitorialità;
- Impostazioni → tutte le card con progressive disclosure;
- Smart con straordinario disattivato → nessun pulsante uscita e microcopy `Uscita automatica alle …`;
- Smart con straordinario attivato → uscita manuale e straordinario realtime.
