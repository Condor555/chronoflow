# Matrice funzionale — shell 2.9.4, motore corrente

La 2.9.4 è la sorgente di verità per DOM, componenti, navigazione e design system. Il motore corrente conserva tutte le funzioni 2.9.x e aggiunge esclusivamente i moduli post-2.9.4 senza sostituire la shell.

| Area | 2.9.4 | Build finale | Sorgente/integrazione | Evidenza di test |
|---|---|---|---|---|
| Bootstrap Supabase | Client UMD e config globale | Client ESM versionato, Publishable Key, nessun `SUPABASE_ANON_KEY` nel grafo attivo | `supabase-client.v3.0.3.mjs` | bootstrap/config + import graph |
| Avvio | Home/Oggi | Home/Oggi anche dopo login, reload e riapertura PWA | `app.js` + cache recovery 3.2 | routing/session + UI restoration |
| Navigazione | Oggi, Calendario, Riepilogo, Impostazioni | Conservata integralmente | DOM 2.9.4 | visual-contract + render |
| Profilo/account | Nome, email, logout | Conservato integralmente | DOM/app 2.9.4 | visual-contract + functional navigation |
| Home | Grande card, tre modalità, metriche e azioni | Conservata; trattamento profondo approvato, decorazione soft e microcopy uscita automatica | DOM 2.9.4 + estensione CSS 3.2.1 + `smart-auto-exit.mjs` | home-display, calculations, theme/render, Smart auto-exit |
| Smart senza straordinario | Timer ordinario limitato | Solo ingresso; uscita automatica con pausa standard/effettiva; ricalcolo non distruttivo | `smart-auto-exit.mjs` | 5 scenari dedicati |
| Smart con straordinario | Timer ordinario fermo e straordinario separato | Conservato | calculations 2.9.x | test realtime Smart |
| Calendario personale | Pianificazione, mese/anno, modifica giornata | Conservato sotto **Il mio** | DOM/app/CSS 2.9.4 | UI audit + render calendario |
| Condivisione | Assente | **Condivisi**, inviti, revoca, privacy, confronto settimanale | moduli Calendar 3.0.5 caricati lazy | calendar-sharing, security, stability |
| Riepilogo | Mese, saldi, dettagli, storico | Conservato integralmente con filtri configurabili | DOM/app/calculations 2.9.4 | calculations + UI audit |
| Impostazioni | Progressive disclosure completa | Otto macro-sezioni single-open; 52 controlli conservati; Avanzate annidate; Condivisione nativa | DOM/app 2.9.4 + accordion 3.2.1 | UI audit, settings contract, render mobile/desktop |
| Genitorialità | Figli, periodi attivi, congedi | Conservata integralmente | calculations/app 2.9.4 | malattia bambino, maternità, paternità, quote parentali |
| Ferie e recuperi | Riporto, festività soppresse, recuperi | Conservati integralmente | calculations/app 2.9.4 | rollover, saldi, festività domenicali |
| Buoni pasto | Regole per modalità e riepilogo mensile | Conservati integralmente | calculations/app 2.9.4 | ticket e riepilogo consolidato |
| Storico | Riclassificazione, associazione figlio, undo | Conservato integralmente | app/migration 2.9.4 | migration + UI audit |
| Notifiche/PWA | Installazione, notifica uscita, offline queue | Conservate; notifica distingue uscita automatica | app/PWA 2.9.4 + SW 3.2 | PWA, live clock, service worker |
| Record null | Gestione baseline | Normalizzazione Calendar 3.0.5 mantenuta | `calendar-record.v3.0.5.mjs` | calendar stability |
| Database sharing | Assente | Migrazione 3.0.0 mantenuta invariata | `20261126_001_calendar_sharing.sql` | security contract + additive migration audit |

## Esito migration 3.0.0

La migration è **additiva rispetto alle tabelle preesistenti**:

- crea esclusivamente cinque tabelle con prefisso `cf_calendar_` usando `CREATE TABLE IF NOT EXISTS`;
- trigger, policy, funzioni e RPC operano esclusivamente sul namespace `cf_calendar_*`;
- non contiene `DROP TABLE`, `TRUNCATE`, né `DELETE`/`UPDATE` sulle tabelle `work_days` o `profiles`;
- i `DROP` presenti riguardano soltanto trigger e policy `cf_*`, ricreati immediatamente nella stessa migration;
- le cancellazioni e gli aggiornamenti applicativi riguardano soltanto le proiezioni condivise `cf_calendar_*`;
- non altera dati personali preesistenti.

Per questo la migration e le RLS vengono lasciate **byte-per-byte invariate** nella patch.
