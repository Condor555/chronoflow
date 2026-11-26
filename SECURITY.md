# Sicurezza

## Segnalazioni

Non pubblicare nei ticket dati personali, backup, password, token o chiavi di servizio. Descrivi il problema usando account e dati di test.

## Regole operative

- Nel frontend è ammessa soltanto la chiave Supabase `anon`/pubblicabile.
- Non inserire mai la chiave `service_role` nella repository.
- Non disattivare le Row Level Security di `profiles` e `work_days`.
- Dopo modifiche allo schema, eseguire `supabase/verify.sql`.
- Prima di un rilascio, provare la separazione con due account distinti.
- Aggiornare periodicamente la dipendenza Supabase indicata in `index.html` e rieseguire i test.

La cache offline è salvata nel browser e separata per ID utente, ma un dispositivo condiviso o compromesso può esporre dati locali. Uscire dall’account e adottare le misure del dispositivo appropriate al contesto d’uso.
