# Installazione patch Chrono Flow 3.3.3

## 1. Baseline

Applicare la patch alla repository corrispondente allo snapshot 3.3.2 allegato. La patch è incrementale: non sostituisce l’intera repository.

## 2. Caricamento su GitHub

1. Estrarre l’archivio della patch nella root della repository.
2. Conservare la struttura delle cartelle.
3. Sovrascrivere i file modificati.
4. Aggiungere i file nuovi.
5. Non cancellare nessun altro file.
6. Verificare l’elenco completo in `PATCH_MANIFEST_3.3.3.md`.

## 3. Verifica locale

Con Node.js disponibile:

```bash
npm run check
npm test
```

Entrambi i comandi devono terminare senza errori. La suite consegnata produce 211 test superati.

## 4. Deploy PWA

Dopo il merge/deploy:

1. attendere la pubblicazione di GitHub Pages;
2. chiudere completamente la PWA e tutte le schede del sito;
3. riaprire Chrono Flow;
4. se una vecchia shell resta visibile, eseguire una sola ricarica forzata oppure cancellare i dati del sito e riaprire.

La build 3.3.3 usa `src/app.v3.3.3.mjs` e `sw.v3.3.3.js`; il nuovo service worker elimina le cache precedenti durante l’attivazione.

## 5. Supabase

Non eseguire nuove query SQL per questa patch. Non ci sono nuove migration.

Le migration Commesse 3.3.0/3.3.1 devono essere già applicate solo se la funzione non era mai stata configurata. Se Commesse funzionava in 3.3.2, Supabase è già pronto.

## 6. Controllo funzionale post-deploy

- Home: scegliere Smart o Trasferta, cambiare schermata, tornare alla Home e riaprire la PWA; la modalità deve restare invariata.
- Calendario personale: toccare una cella, modificare modalità e orari, salvare e tornare alla Home; deve esistere una sola giornata per la data.
- Calendario condiviso: verificare che non presenti azioni di modifica.
- Registra attività: aprire il dialogo, cercare per codice e descrizione, selezionare più commesse e salvare con metodo automatico e manuale.
- Pausa automatica: con ingresso precedente alle 13:00, verificare lo stato `Pausa automatica` durante l’intervallo configurato e la ripresa alla scadenza.
