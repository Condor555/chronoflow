# Installazione patch Chrono Flow 3.3.5

## Prerequisito

La repository deve contenere Chrono Flow 3.3.3. La 3.3.5 sostituisce la 3.3.4 non valida e conserva gli entry point precedenti.

## Procedura

1. Esegui un backup della repository e del database.
2. Estrai `CHRONO_FLOW_PATCH_3.3.5.zip`.
3. Copia **il contenuto** della cartella estratta nella root della repository, mantenendo i percorsi.
4. Sovrascrivi i file omonimi; non eliminare file 3.3.3 o precedenti.
5. In Supabase SQL Editor esegui una sola volta:
   `supabase/migrations/20261127_335_live_allocations_invitation_status.sql`.
6. Non modificare `src/config.js` e non rieseguire le migration precedenti.
7. Esegui, se disponibili:
   - `npm run check`
   - `npm test`
   - `npm run test:e2e`
8. Pubblica su GitHub Pages.
9. Chiudi completamente schede e PWA, poi riapri Chrono Flow. Il worker 3.3.5 elimina le cache precedenti.

## Controllo manuale minimo

- Apri `Registra attività` su una giornata senza allocazioni: nessuna commessa deve essere selezionata.
- Cerca e seleziona due commesse: dopo ciascuna selezione ricerca vuota, lista completa e focus nel campo.
- Usa `Modifica` sulla seconda riga: deve comparire soltanto l'editor della voce.
- Verifica una percentuale durante il timer e una durata manuale `1:15`.
- Imposta un orario pausa diverso da 13:00 e verifica stop/ripresa e pulsante realmente disabilitato dopo la finestra.
- Controlla lo stesso totale in Home, Calendario e Riepilogo.
- In Condivisione calendario verifica gli stati `In attesa`, `Attivo` e `Rifiutato` dopo refresh.

## Rollback

Per il frontend, ripristina i file della 3.3.3 e pubblica con una nuova cache. La colonna `allocation_percentage` può restare installata: è additiva e non interferisce con la 3.3.3. Non eseguire `DROP COLUMN` in produzione senza un piano di migrazione dati.
