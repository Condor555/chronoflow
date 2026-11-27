# Manifest patch Chrono Flow 3.3.4

**Baseline:** Chrono Flow 3.3.3  
**Tipo:** patch incrementale; contiene esclusivamente file nuovi o modificati rispetto alla 3.3.3  
**Obiettivo:** correggere il flusso Commesse senza modificare schema Supabase, dati o funzioni non correlate

## Comportamenti corretti

- Una nuova registrazione parte senza commesse selezionate, anche se una commessa era stata usata in passato o impostata come preferita.
- Le commesse già presenti nella giornata non sono proposte come nuove aggiunte e restano invariate.
- Dopo ogni selezione il campo di ricerca viene svuotato, l’elenco torna non filtrato e il focus ritorna nel campo; la selezione appena effettuata resta attiva.
- Il pulsante **Modifica** apre un dialogo dedicato alla sola allocazione scelta.
- Il dialogo singolo permette esclusivamente di cambiare la percentuale automatica, cambiare le ore manuali oppure rimuovere quella voce.
- Salvataggio ed eliminazione aggiornano immediatamente Home, Calendario, dettaglio giornata e Riepilogo tramite lo stesso stato locale e la stessa sincronizzazione già esistenti.

## File modificati

- `CHANGELOG.md`
- `index.html`
- `package.json`
- `styles.css`
- `src/app.js`
- `src/project-allocation-policy.mjs`
- `sw.js`
- `tests/authoritative-shell-bootstrap.test.mjs`
- `tests/bootstrap-config-2.9.4.test.mjs`
- `tests/critical-regressions-v3.3.1.test.mjs`
- `tests/critical-regressions-v3.3.3.test.mjs`
- `tests/import-graph-v3.0.5.test.mjs`
- `tests/project-allocation-policy.test.mjs`
- `tests/projects-feature.test.mjs`
- `tests/ui-restoration-v3.1.0.test.mjs`

## File nuovi

- `PATCH_MANIFEST_3.3.4.md`
- `docs/INSTALLAZIONE_PATCH_3.3.4.md`
- `docs/TEST_REPORT_3.3.4.md`
- `src/app.v3.3.4.mjs`
- `sw.v3.3.4.js`
- `tests/critical-regressions-v3.3.4.test.mjs`

## File da conservare

Non eliminare i file delle versioni precedenti, inclusi `src/app.v3.3.3.mjs` e `sw.v3.3.3.js`. La nuova patch aggiunge gli entry point immutabili 3.3.4 e aggiorna i puntatori correnti.

## Supabase

Non sono richieste query SQL, migration, modifiche RLS o trasformazioni dei dati. La percentuale modificata viene salvata nel `duration_minutes` dell’allocazione esistente, mantenendo il relativo `id` e `allocation_method`.

## Verifica

```bash
npm run check
npm test
```

Risultati ottenuti:

- controlli mirati: **67/67 superati**;
- suite completa: **220/220 superati**;
- errori: **0**.
