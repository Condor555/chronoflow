# Installazione patch Chrono Flow 3.3.4

## Baseline

Applicare questa patch sopra Chrono Flow 3.3.3 già funzionante.

## Procedura

1. Estrarre lo ZIP.
2. Copiare **il contenuto** della cartella `CHRONO_FLOW_PATCH_3.3.4` nella root della repository GitHub.
3. Mantenere esattamente i percorsi delle cartelle.
4. Sovrascrivere soltanto i file omonimi richiesti.
5. Non eliminare gli entry point e i service worker precedenti.
6. Non modificare `src/config.js`.
7. Non eseguire query nel SQL Editor di Supabase.
8. Attendere il deploy di GitHub Pages.
9. Chiudere completamente browser e PWA, quindi riaprire Chrono Flow per consentire l’attivazione del service worker 3.3.4.

## Controllo funzionale consigliato

1. Aprire **Registra attività** su una giornata: nessuna commessa deve essere già selezionata.
2. Cercare una commessa per codice o descrizione e selezionarla: la ricerca deve svuotarsi, l’elenco deve tornare completo e il cursore deve restare nel campo di ricerca.
3. Ripetere con una seconda commessa: entrambe devono restare selezionate.
4. Salvare e verificare i totali in Home, Calendario e Riepilogo.
5. Dal dettaglio giornata premere **Modifica** accanto a una singola commessa: non devono comparire ricerca o selezione multipla.
6. Per un’allocazione automatica cambiare la percentuale; per una manuale cambiare le ore.
7. Salvare e controllare il totale allocato.
8. Riaprire lo stesso dialogo, eliminare la voce e verificare l’aggiornamento immediato.

## Verifica automatica facoltativa

```bash
npm run check
npm test
```

Risultati della patch consegnata: **67/67** controlli mirati e **220/220** test complessivi superati.
