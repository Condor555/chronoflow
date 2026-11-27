# Manifest patch Chrono Flow 3.3.5

**Baseline di installazione:** Chrono Flow 3.3.3  
**Sostituisce:** la patch 3.3.4 non valida  
**Tipo:** patch incrementale; contiene esclusivamente file nuovi o modificati per questa correzione.

## Diff funzionale per file

| File | Tipo | Diff funzionale |
|---|---|---|
| `CHANGELOG.md` | modificato | Aggiunge le note cumulative 3.3.5. |
| `SHA256SUMS` | generato | Hash di integrità per ogni file incluso nel pacchetto. |
| `index.html` | modificato | Versiona la build; aggiunge editor singola allocazione, input Ore/Minuti, orario pausa automatica e microcopy accessibile. |
| `package.json` | modificato | Porta la versione a 3.3.5 e aggiunge il gate E2E Chromium. |
| `styles.css` | modificato | Stili per durata HH:MM, percentuale, editor singolo e badge testuali inviti. |
| `sw.js` | modificato | Shim verso il worker cache-safe 3.3.5. |
| `sw.v3.3.5.js` | nuovo | Cache `chrono-flow-v3.3.5-live-allocations-invitations`; include entry e asset aggiornati. |
| `src/app.v3.3.5.mjs` | nuovo | Entry point immutabile della build 3.3.5. |
| `src/app.js` | modificato | Flussi Registra/Modifica separati; reset/focus ricerca; percentuali live; minuti manuali; pausa configurabile e blocco pausa manuale; refresh stati inviti; aggiornamento Home/Calendario/Riepilogo. |
| `src/calculations.mjs` | modificato | Finestra automatica basata su orario configurato; sottrazione progressiva senza doppio conteggio; metadata start/end/active. |
| `src/project-allocation-policy.mjs` | modificato | Conversione Ore/Minuti, validazione minuti 0–59, percentuali persistenti e calcolo live al minuto. |
| `src/calendar-sharing-view.v3.0.5.mjs` | modificato | Stati inviti testuali e persistenti, azioni Annulla/Revoca, deduplica client e visibilità anche a condivisione sospesa. |
| `supabase/migrations/20261127_335_live_allocations_invitation_status.sql` | nuovo | Aggiunge `allocation_percentage`, backfill non distruttivo, invito idempotente e dashboard stati aggiornato. |
| `tests/live-allocations-v3.3.5.test.mjs` | nuovo | Test dominio/contratto per percentuali, HH:MM, pausa configurabile, DOM e inviti. |
| `tests/e2e-integrated-v3.3.5.py` | nuovo | Chromium reale: dialoghi, focus, timer, pausa, viste e inviti. |
| `tests/authoritative-shell-bootstrap.test.mjs` | modificato | Aggiorna esclusivamente i riferimenti di release/worker alla 3.3.5. |
| `tests/bootstrap-config-2.9.4.test.mjs` | modificato | Aggiorna esclusivamente il worker autorevole; contratto config invariato. |
| `tests/critical-regressions-v3.3.1.test.mjs` | modificato | Aggiorna release/cache e mantiene i controlli Home/Calendario. |
| `tests/import-graph-v3.0.5.test.mjs` | modificato | Verifica il nuovo entry point senza alterare il grafo stabile. |
| `tests/projects-feature.test.mjs` | modificato | Verifica il calcolo automatico percentuale al posto dello snapshot statico. |
| `tests/ui-restoration-v3.1.0.test.mjs` | modificato | Aggiorna i riferimenti di bootstrap alla 3.3.5. |
| `docs/INSTALLAZIONE_PATCH_3.3.5.md` | nuovo | Procedura di installazione e migration. |
| `docs/TEST_REPORT_3.3.5.md` | nuovo | Evidenze dei gate unitari e DOM reali. |

## Supabase: necessità dimostrata

La nuova colonna `allocation_percentage` è necessaria perché `work_allocations` 3.3.3 conserva soltanto `duration_minutes` e `allocation_method`: senza una percentuale stabile, una voce impostata al 50% non può restare al 50% mentre il timer cresce o dopo la riapertura su un altro dispositivo.

La stessa migration sostituisce due RPC esistenti senza cambiare RLS:

- l'invito alla stessa email pendente restituisce l'ID esistente invece di creare un duplicato;
- il dashboard restituisce tutti gli stati persistenti e materializza gli inviti scaduti.

Non vengono eliminate tabelle, righe, policy o colonne. La nuova preferenza `automatic_break_time` è salvata nel JSON `family_settings` già esistente e non richiede schema aggiuntivo.

## Esclusioni

- `src/config.js` non è incluso e non viene modificato.
- Nessuna credenziale è inclusa.
- Nessuna migration precedente viene modificata o ripetuta.
- Il calendario condiviso resta in sola lettura e la mascheratura privacy resta invariata.
- Gli entry point e worker precedenti non devono essere eliminati.
