# Chrono Flow 3.0.1 — HOTFIX bootstrap 2.9.4

Patch incrementale da applicare **sopra la patch 3.0.0 già pubblicata**.

## Problema corretto

La 3.0.0 richiedeva il named export `SUPABASE_ANON_KEY`, assente nel contratto della configurazione 2.9.4. Poiché gli import ES module vengono verificati prima dell'esecuzione, il browser interrompeva l'intero bootstrap con `SyntaxError`.

La hotfix usa senza rinominarli gli export già esistenti:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

`src/config.js` non viene incluso, letto in scrittura o modificato. Non sono richieste nuove credenziali.

## File modificati (2)

| Percorso | Modifica |
|---|---|
| `src/config/supabase-client.mjs` | Rimuove la dipendenza da `SUPABASE_ANON_KEY`; usa il contratto 2.9.4 con import namespace e Publishable Key. |
| `sw.js` | Porta la cache a `chrono-flow-v3.0.1-bootstrap-hotfix` per invalidare il modulo JavaScript rotto. |

## File nuovi di test (2)

| Percorso | Scopo |
|---|---|
| `tests/bootstrap-config-2.9.4.test.mjs` | Import reale del client contro una config 2.9.4; fallisce se viene richiesto un export assente. |
| `tests/fixtures/config-2.9.4.js` | Fixture senza credenziali reali che esporta solo URL e Publishable Key. |

`SHA256SUMS` documenta l'integrità del pacchetto.

## Esclusioni intenzionali

- nessun `src/config.js`;
- nessuna migration SQL;
- nessuna modifica alle tabelle, alle policy RLS o alle RPC già installate;
- nessuna modifica a timer, giornate, colori o UI;
- nessuna nuova credenziale.

## Applicazione via browser GitHub

1. Estrai lo ZIP.
2. Nella repository apri `src/config/supabase-client.mjs`, scegli **Edit** e sostituisci tutto con il file della hotfix.
3. Apri `sw.js` e sostituiscilo con quello della hotfix.
4. Carica i due file di test mantenendo i percorsi indicati.
5. Esegui un solo commit, ad esempio `fix: restore 2.9.4 Supabase bootstrap contract`.
6. Attendi GitHub Pages, poi chiudi completamente la PWA e tutte le schede del sito.
7. Riapri il sito. Se il vecchio Service Worker resta attivo, esegui una sola ricarica forzata o cancella i dati del sito e riapri.

## Supabase

**Non aprire SQL Editor e non rilanciare la migration 3.0.0.** Questa hotfix è esclusivamente frontend.

## Verifica

- la Console non deve più mostrare l'errore relativo a `SUPABASE_ANON_KEY`;
- login e bootstrap devono usare la configurazione 2.9.4 esistente;
- `node --test tests/bootstrap-config-2.9.4.test.mjs` deve terminare con 2 test superati.
