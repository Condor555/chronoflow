# Chrono Flow 3.3.5 — Commesse live, pausa configurabile e inviti persistenti

- `Registra attività` ricostruisce la selezione solo dalle allocazioni già salvate per la data, senza preferite o selezioni residue.
- Ricerca multi-commessa con reset immediato, lista non filtrata e focus ripristinato dopo ogni selezione.
- Editor dedicato alla singola allocazione: sola percentuale, sola durata manuale HH:MM oppure rimozione.
- Percentuali persistenti e calcolate in tempo reale sul lavoro netto; ore manuali fisse al minuto.
- Home, Calendario, Riepilogo e dettaglio giornata usano lo stesso valore dinamico.
- Orario pausa automatica configurabile, fallback compatibile `13:00`, stop/ripresa del timer e blocco reale della seconda pausa manuale.
- Inviti calendario persistenti con stati testuali `In attesa`, `Attivo`, `Rifiutato`, `Annullato`, `Scaduto` e deduplica per email.
- Migration additiva per `allocation_percentage` e RPC inviti idempotente; nessuna modifica alle RLS o ai dati privati condivisi.
- Verifica integrata in Chromium sul DOM reale della build, oltre alla suite completa.

# Chrono Flow 3.2.1 — Home profonda e Impostazioni semplificate

- Home aggiornata con la card ampia approvata: gradienti profondi per modalità, decorazione circolare soft e contrasto WCAG AA.
- Microcopy `Uscita automatica alle HH:MM` integrata nella card Smart; nessuna reintroduzione del pulsante uscita quando lo straordinario Smart è disattivato.
- Impostazioni ridotte a otto macro-sezioni con sintesi utile e accordion single-open.
- Opzioni rare spostate nelle sottosezioni Avanzate senza eliminare controlli, dati o logiche.
- Validazione inviti calendario resa inline e accessibile, senza tooltip nativo bloccante.
- Salvataggio generale indipendente dal campo invito; label `Condivisione attiva` / `Condivisione non attiva` e controlli invito/privacy sospesi quando OFF senza cancellare storico o inviti.
- 52 controlli dati delle Impostazioni verificati invariati.
- 164 test automatici e render 390 px/desktop superati.
- `src/config.js`, SQL/RLS e dati invariati.

# Chrono Flow 3.2.0 — UI 2.9.4 autorevole

- `index.html`, DOM e CSS 2.9.4 sono la shell grafica autorevole.
- Entry point e service worker immutabili 3.2.0; le entry 3.0.x/3.1.0 diventano shim di recupero per eliminare definitivamente la shell minimale dalla cache.
- Calendario condiviso integrato nativamente in Calendario → Il mio / Condivisi; nessun pulsante flottante.
- Inviti, revoca e privacy integrati in Impostazioni tramite progressive disclosure.
- Motore funzionale post-2.9.4 preservato integralmente.
- Migration/RLS calendario verificata additiva e lasciata invariata.
- `src/config.js` e dati invariati.
- 155 test automatici e render test 390 px/desktop superati.

# Chrono Flow 3.1.0 — Ripristino UI cumulativo

- Ripristinata integralmente la UI/UX 2.9.4: Oggi, Calendario personale, Riepilogo, Impostazioni e Profilo/account.
- Integrata la condivisione calendario 3.0.x in `Calendario → Il mio / Condivisi`, con caricamento lazy e fallback isolato.
- Conservate le correzioni Supabase, routing e service worker della 3.0.5.
- Aggiunta uscita automatica Smart Working quando lo straordinario Smart è disattivato.
- Nessuna modifica a `src/config.js`, SQL, RLS o dati.
- 136 test automatici superati.

# Changelog

## 3.0.0 — 2026-11-26

### Aggiunto
- Condivisione calendario personale in sola lettura.
- Inviti per email account, accettazione/rifiuto, annullamento e revoca in app.
- Preferenze privacy campo per campo con default restrittivi.
- Calendari condivisi mensili e confronto settimanale mobile-first.
- Schema Supabase con RLS, funzioni mascherate e struttura pronta per gruppi/famiglie.
- Test di contratto privacy/RLS e test DOM computed-style.

### Corretto
- Pill Ufficio, Smart Working e Trasferta ricondotte alle rispettive palette delle card timer.
- Card, gradienti, anelli decorativi e logiche del timer non modificati dalla correzione cromatica.
