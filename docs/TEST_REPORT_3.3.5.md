# Test report Chrono Flow 3.3.5

Data esecuzione: 27 novembre 2026  
Browser E2E: Chromium headless, DOM reale di `index.html` + `src/app.v3.3.5.mjs`.

## Gate eseguiti

| Comando | Esito |
|---|---:|
| `npm run check` | 35/35 superati; sintassi runtime/worker valida |
| `npm test` | 210/210 superati |
| `npm run test:e2e` | 3 scenari integrati superati |

## Verifiche E2E sul DOM reale

### 1. Registra attività ed editor singolo

- apertura del dialog dalla Home;
- zero checkbox selezionate su giornata senza allocazioni;
- ricerca `ALFA`, selezione, cancellazione automatica query, lista nuovamente completa e focus nel search;
- ripetizione immediata con `BETA`;
- chiusura senza salvataggio e riapertura: zero preselezioni residue;
- nuova selezione consecutiva e salvataggio di due commesse;
- apertura di `Modifica` sulla sola seconda riga;
- assenza di ricerca e checkbox multiple nel dialog singolo;
- modifica della percentuale della seconda voce;
- prima allocazione invariata.

### 2. Timer, percentuali, HH:MM, pausa e viste

Dati: commessa automatica 50%, commessa manuale 1:15, ingresso 08:43, pausa automatica configurata 12:45 per 30 minuti.

- prima della pausa: automatica 2:00, manuale 1:15;
- avanzamento timer fino alle 12:45: automatica 2:01;
- 12:45–13:15: stato `Pausa automatica`, bottone pausa realmente `disabled`, automatica ferma a 2:01, manuale ferma a 1:15;
- reload PWA simulato durante la finestra: stessi valori ricostruiti dagli orari;
- alle 13:15: `Pausa standard già applicata`, bottone ancora `disabled`;
- reload dopo la finestra: blocco persistente;
- avanzamento a 13:17: automatica 2:02, manuale ancora 1:15;
- totale 3:17 identico in Home, Calendario e Riepilogo.

### 3. Fallback pausa e inviti persistenti

- profilo privo del nuovo campo: Impostazioni mostra fallback `13:00`;
- invito backend pendente reso con badge testuale `In attesa` e azione `Annulla invito`;
- nuovo submit sulla stessa email: una sola riga, nessuna seconda chiamata di creazione;
- cambio backend a `Rifiutato`, chiusura/riapertura sezione: stato aggiornato;
- reload PWA: stato `Rifiutato` ancora presente;
- cambio backend ad accettato: badge `Attivo` e azione `Revoca accesso`.

## Verifiche di non regressione

La suite completa copre inoltre autenticazione/bootstrap, UI 2.9.4 ripristinata, Home, Calendario personale modificabile, Calendario condiviso in sola lettura, Impostazioni single-open, privacy, modalità giornaliera persistente, uscita automatica Smart, offline queue, migrazioni additive e service worker.

## Limite dichiarato

L'E2E usa un backend Supabase deterministico simulato per verificare il DOM integrato senza credenziali reali. La migration SQL e le RPC sono verificate da test di contratto; dopo il deploy resta necessario il normale smoke test con il progetto Supabase dell'utente.
