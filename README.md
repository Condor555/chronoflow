# Chrono Flow 3.2.0 — UI 2.9.4 autorevole, motore corrente

La shell grafica, il DOM, i componenti e il design system derivano dalla baseline 2.9.4. Le funzioni successive restano attive e sono integrate come estensioni native: condivisione calendario, stabilità 3.x e uscita automatica Smart.

La regressione visiva era nel frontend/bootstrap: le pagine ancora collegate all’entry point 3.0.5 continuavano a montare la shell minimale. Non è stata attribuita alla migration Supabase. La 3.2.0 sostituisce gli entry point e worker precedenti con shim di recupero verso la shell completa.

- Matrice funzionale: `docs/FUNCTIONAL_MATRIX_2.9.4_CURRENT.md`
- Audit finale: `docs/FINAL_UI_RESTORATION_3.2.0.md`
- Installazione: `docs/INSTALLAZIONE_PATCH_3.2.0.md`
- Evidenze render: `tests/render-output/`

---

 Chrono Flow 3.0.0 — Condivisione calendario

Questa release aggiunge la condivisione del calendario con utenti specifici, in sola lettura, senza esporre direttamente le tabelle personali.

## Funzioni

- attivazione e sospensione globale della condivisione;
- inviti indirizzati all'email dell'account Chrono Flow;
- accettazione, rifiuto, annullamento e revoca in app;
- privacy selettiva: per default è condivisa soltanto la modalità `Ufficio`, `Smart Working` o `Trasferta`;
- stato generico `Assente` attivabile separatamente;
- orari, straordinari, buoni pasto, ferie residue, causali dettagliate, note e dati sui figli disattivati per default;
- `Calendario → Il mio / Condivisi / Confronta`;
- calendario mensile di una singola persona;
- confronto settimanale mobile-first a card;
- modello `space + membership` predisposto per gruppi/famiglie;
- accesso solo dopo login e RLS Supabase;
- pill modalità riallineate alla palette delle card timer, senza cambiare gradienti, decorazioni o logiche del timer.

## Architettura privacy

`cf_calendar_entries` è una proiezione privata del proprietario. I viewer non ricevono `SELECT` diretto. La funzione `cf_get_shared_calendar` verifica, nell'ordine:

1. sessione autenticata;
2. membership attiva;
3. condivisione globale attiva;
4. intervallo massimo di 400 giorni;
5. preferenze campo per campo.

I campi disattivati vengono trasformati in `NULL` dentro il database, prima della risposta. Le policy RLS impediscono di aggirare la funzione con PostgREST.

## Installazione completa

1. Conserva una copia del tuo `src/config.js` già configurato.
2. Carica tutti i file di questa repository su GitHub.
3. Ripristina nel nuovo `src/config.js` il Project URL e la Publishable/Anon Key.
4. In Supabase apri **SQL Editor → New query**, incolla `supabase/migrations/20261126_001_calendar_sharing.sql` ed esegui **Run**.
5. Attendi GitHub Pages, chiudi la PWA e riaprila.
6. Accedi con due account diversi e completa il collaudo descritto in `docs/INSTALLAZIONE_BROWSER.md`.

## Patch dalla 2.9.4

Usa il pacchetto `chrono-flow-v3.0.0-PATCH-from-2.9.4.zip`. Non contiene `src/config.js` né altri file dichiarati invariati. Leggi prima `PATCH_MANIFEST.md` e `docs/INSTALLAZIONE_BROWSER.md`.

> Nota di integrazione: la proiezione deve essere aggiornata quando la baseline salva o importa giornate. Il metodo `mapChronoDaysToProjection()` normalizza i record 2.9.4 e `upsertProjection()` li invia alla tabella privata. La repository completa mostra l'integrazione nel modulo applicativo; per un merge manuale vedere `docs/INTEGRAZIONE_BASELINE_2.9.4.md`.

## Test

```bash
npm test
npm run check
```

Il test DOM reale è `tests/home-theme.browser.html`: servilo tramite HTTP e aprilo in un browser. L'attributo `data-result="passed"` viene impostato solo se tutte le modalità superano i controlli computed-style e contrasto WCAG.
