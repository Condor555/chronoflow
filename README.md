# Chrono Flow 3.3.6 — mobile/iPhone

La build 3.3.6 aggiunge una Home compatta per smartphone, safe area iOS completa e mantiene la pausa automatica configurabile. Consulta `docs/NOTE_RILASCIO_3.3.6.md` per installazione e collaudo.

---

# Chrono Flow 3.2.1 — Home approvata e Impostazioni progressive

La shell e il design system restano quelli ripristinati dalla 2.9.4, mentre la Home usa la superficie profonda già approvata: gradiente per modalità, decorazione circolare soft e nuova uscita Smart automatica integrata.

Le Impostazioni sono organizzate in otto macro-sezioni single-open con sintesi a card chiusa. Tutti i 52 controlli dati della build precedente sono conservati; opzioni rare e tecniche sono state spostate in sottosezioni Avanzate chiuse di default.

La condivisione calendario non partecipa alla validazione del salvataggio generale: l’email viene controllata solo con **Invita**. Il toggle mostra **Condivisione attiva** o **Condivisione non attiva**; quando è OFF, inviti e permessi vengono sospesi e nascosti senza cancellare accessi, storico o inviti esistenti.

- Specifica e verifica: `docs/HOME_SETTINGS_UX_3.2.1.md`
- Installazione: `docs/INSTALLAZIONE_PATCH_3.2.1.md`
- Matrice funzionale: `docs/FUNCTIONAL_MATRIX_2.9.4_CURRENT.md`
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
