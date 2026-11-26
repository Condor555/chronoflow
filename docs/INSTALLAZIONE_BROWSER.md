# Installazione via browser GitHub e Supabase

## Prima di iniziare

1. Scarica un backup della repository 2.9.4 da GitHub (`Code → Download ZIP`).
2. Copia il contenuto di `src/config.js` in un luogo sicuro.
3. Non cancellare tabelle o dati esistenti e non usare la Service Role Key nel browser.

## A. Applicare la PATCH su GitHub

1. Estrai `chrono-flow-v3.0.0-PATCH-from-2.9.4.zip`.
2. Apri la repository su GitHub e seleziona il branch pubblicato da GitHub Pages.
3. Carica i file **nuovi** con `Add file → Upload files`, rispettando le cartelle indicate nel manifest.
4. Per ogni file **modificato**, apri il percorso, scegli l'icona matita, sostituisci il contenuto con quello della PATCH e usa `Commit changes`.
5. Non modificare `src/config.js`: non è incluso nella PATCH.
6. Usa un unico messaggio di commit, ad esempio `feat: condivisione calendario e palette pill`.
7. Attendi il completamento del workflow Pages.

## B. Applicare la migrazione su Supabase

1. Apri il progetto Supabase corretto.
2. Vai a `SQL Editor → New query`.
3. Apri localmente `supabase/migrations/20261126_001_calendar_sharing.sql`, copia tutto e incollalo nell'editor.
4. Premi `Run`. Il risultato deve terminare senza errori.
5. In `Table Editor` verifica la presenza delle cinque tabelle con prefisso `cf_calendar_`.
6. In `Authentication → Policies` verifica che RLS sia attivo su tutte e cinque.
7. Non aggiungere policy di lettura viewer su `cf_calendar_entries`: la lettura condivisa deve passare dalla RPC mascherata.

## C. Aggiornare la PWA

1. Attendi GitHub Pages.
2. Chiudi tutte le schede e la PWA installata.
3. Riapri; se necessario svuota i dati del sito una sola volta per caricare `chrono-flow-v3.0.0`.

## D. Collaudo con due account

1. Account A: apri `Calendario → Condivisione`, attiva la condivisione e invita l'email dell'account B.
2. Account B: accedi con la stessa email, apri `Calendario → Condivisi`, accetta.
3. Verifica che B veda solo Ufficio/Smart Working/Trasferta.
4. Account A: attiva `Stato generico di assenza`; B deve vedere solo `Assente`, non la causale.
5. Verifica che orari, straordinari, buoni, ferie residue, note e figli non compaiano finché disattivati.
6. A revoca B: B non deve più vedere il calendario al successivo aggiornamento.
7. A disattiva la condivisione: tutti gli accessi risultano sospesi.
8. Seleziona più persone in `Confronta` e verifica la settimana a card su smartphone.
9. Apri `tests/home-theme.browser.html` via GitHub Pages: deve mostrare solo `PASS` e impostare `data-result="passed"`.

## Ripristino

Per il frontend, ripristina il commit precedente da GitHub. La migrazione è additiva: può restare installata senza influire sui dati 2.9.4. Per rimuoverla completamente, esporta prima eventuali dati di condivisione e usa una migrazione di rollback controllata; non cancellare oggetti direttamente in produzione.
