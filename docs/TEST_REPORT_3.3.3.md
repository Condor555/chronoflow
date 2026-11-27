# Test report Chrono Flow 3.3.3

## Baseline

Test eseguiti sulla repository ricostruita direttamente da `CHRONO_FLOW_REPO_SNAPSHOT.txt` (build 3.3.2), senza sostituzione della UI o delle funzioni esistenti.

## Comandi eseguiti

```bash
npm run check
npm test
```

## Risultati

- Suite mirata `npm run check`: **66 test superati, 0 falliti**.
- Suite completa `npm test`: **211 test superati, 0 falliti**.
- Controllo sintattico superato per entry point, applicazione, calcoli, policy commesse, fonte modalità giornaliera e service worker.

## Flussi completi aggiunti

Il file `tests/full-user-flows.test.mjs` verifica sequenze complete e stato persistito, non soltanto singole funzioni:

1. **Home → Calendario → modifica → Home → riapertura/sincronizzazione**
   - pianificazione Smart letta dalla Home;
   - modifica a Trasferta con ingresso, pausa e uscita;
   - upsert sulla stessa data senza duplicati;
   - ritorno Home, riapertura e sincronizzazione su altro dispositivo;
   - successivo cambio modalità Home sullo stesso record.

2. **Calendario personale → assenza → vista condivisa**
   - modifica della giornata personale ad assenza;
   - persistenza della causale;
   - proiezione condivisa non mutabile e nessuna scrittura sul record personale.

3. **Home → Registra attività → ricerca/selezione multipla → salva**
   - ricerca per codice e descrizione;
   - due commesse nella stessa finestra;
   - ripartizione automatica 50%/50%;
   - modifica successiva con ore manuali;
   - stesso insieme di dati osservato da Home, Calendario e Riepilogo.

4. **13:00 → pausa automatica → chiusura/riapertura → ripresa**
   - lavoro fermo dalle 13:00;
   - pausa esclusa dalle ore lavorate;
   - ricostruzione identica da dati serializzati durante la pausa;
   - ripresa automatica alla scadenza configurata;
   - nessuna dipendenza da un timer rimasto attivo in background.

## Regressioni complete

La suite completa conserva i test della baseline per:

- shell/UI 2.9.4 ripristinata;
- login, routing e riapertura PWA;
- calendario personale e condiviso;
- condivisione e privacy/RLS;
- conteggi, straordinari, ticket e assenze;
- congedi, malattia bambino, ferie e recuperi;
- commesse e allocazioni;
- service worker, cache e stale-shell recovery;
- accessibilità e layout mobile-first.

## Limite dichiarato

La verifica consegnata è automatica a livello di flusso applicativo, persistenza simulata e cablaggio UI reale. Dopo il deploy resta necessario il controllo manuale post-deploy indicato in `docs/INSTALLAZIONE_PATCH_3.3.3.md`, soprattutto per aggiornamento del service worker e comportamento installato della PWA sul dispositivo reale.
