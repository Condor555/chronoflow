# Chrono Flow 3.3.2

Patch correttiva incrementale sulla baseline 3.3.1.

## Correzioni reali

### Home: la pianificazione odierna resta la sorgente di verità

Prima dell'ingresso, la Home usa la modalità pianificata per oggi. Un vecchio valore `actual_type` senza attività registrate non può più riportare la giornata a Ufficio dopo refresh, riapertura PWA o sincronizzazione.

Dopo la prima attività registrata, la modalità effettiva torna correttamente prioritaria. Ufficio resta il default soltanto se oggi non esiste alcuna giornata salvata.

Il cambio modalità dalla Home continua ad aggiornare la stessa riga `work_days` mediante upsert sulla chiave `user_id,work_date`, senza duplicati.

### Calendario personale: modifica completa ripristinata

Il tap sulle giornate del Calendario personale usa ora un listener delegato stabile, registrato prima delle sezioni opzionali. Il dettaglio permette di modificare modalità pianificata/effettiva, ingresso, uscita, pausa, causale/assenza, ticket, note e commesse quando attive.

È stato inoltre eliminato il vero errore runtime che bloccava l'apertura del dettaglio con Commesse attive: il codice chiamava `lastEventTime`, funzione inesistente. Tutti i calcoli interessati usano ora `calculationNow`.

Il Calendario condiviso resta in sola lettura.

## Compatibilità

- Nessuna modifica a `src/config.js`.
- Nessuna migration SQL.
- Nessuna modifica a schema, RLS o dati.
- Tutte le funzioni della 3.3.1 restano presenti.
- Cache PWA aggiornata alla 3.3.2.
