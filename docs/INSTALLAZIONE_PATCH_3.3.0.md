# Installazione patch Chrono Flow 3.3.0 sopra 3.2.2

Questa è una patch incrementale. Applicarla esclusivamente a una repository che contiene già la baseline stabile **Chrono Flow 3.2.2**.

## Prima di iniziare

1. Crea un backup o un branch della 3.2.2 attualmente pubblicata.
2. Non modificare e non sostituire `src/config.js`.
3. Non cancellare o ricreare tabelle/dati esistenti.

## 1. Esegui la migration additiva Supabase

Nel progetto Supabase già usato da Chrono Flow:

1. apri **SQL Editor**;
2. apri il file `supabase/migrations/20261127_330_projects_allocations.sql` contenuto nella patch;
3. copia tutto il contenuto nell’editor;
4. esegui una sola volta lo script;
5. verifica che l’esecuzione termini senza errori.

La migration crea soltanto:

- `public.work_projects`;
- `public.work_allocations`;
- indici, trigger `updated_at`, policy RLS e grant limitati alle due nuove tabelle.

Non modifica `profiles`, `work_days`, la condivisione calendario o dati esistenti. È idempotente per reinstallazioni controllate.

## 2. Carica la patch

1. Estrai lo ZIP.
2. Carica **il contenuto** della cartella estratta nella root della repository.
3. Mantieni esattamente i percorsi.
4. Sovrascrivi i file omonimi.
5. Non caricare una cartella contenitore aggiuntiva.
6. Non modificare `src/config.js`.

## 3. Pubblica e svuota la vecchia cache PWA

1. Attendi il completamento del deploy GitHub Pages.
2. Chiudi tutte le schede di Chrono Flow.
3. Chiudi completamente l’eventuale PWA installata.
4. Riapri Chrono Flow. Il service worker 3.3.0 elimina le cache precedenti.
5. Se il browser continua a mostrare la 3.2.2, esegui un aggiornamento forzato una sola volta.

## 4. Attiva la funzione

1. Apri **Impostazioni → Commesse**.
2. Attiva **Gestione commesse**.
3. Aggiungi almeno una commessa con codice e descrizione breve.
4. Se vuoi, scegli la commessa predefinita.
5. Premi **Salva le impostazioni**.

Finché l’interruttore resta disattivato, Home, Calendario e Riepilogo conservano la resa della 3.2.2 e non mostrano elementi relativi alle commesse.

## Controllo rapido

- Home: compare **Commesse di oggi → Registra attività** solo dopo l’attivazione.
- Inserisci due attività su commesse diverse nella stessa giornata.
- Verifica il confronto “allocate / lavorate” e l’avviso non bloccante.
- Calendario: apri la giornata e modifica una delle attività.
- Riepilogo: apri **Commesse** e verifica totale mensile, ore per commessa, andamento mensile e giornate.
- Impostazioni: archivia una commessa e verifica che lo storico resti visibile.
- Disattiva la funzione e salva: gli elementi delle commesse devono scomparire da tutte le viste operative.

## Test inclusi

Il collaudo della patch ha superato 140 test applicabili della baseline e della nuova feature. Per il controllo mirato delle commesse:

```bash
node --test tests/projects-feature.test.mjs
```

La verifica visuale richiede Playwright e Chromium nel percorso indicato dallo script:

```bash
python3 tests/verify_projects_ui.py tests/render-output-3.3.0
```

## Rollback funzionale

Per sospendere immediatamente la funzione senza perdere dati, disattivala da **Impostazioni → Commesse** e salva. Non eliminare le nuove tabelle: contengono lo storico e non interferiscono con la 3.2.2 quando la funzione è disattivata.
