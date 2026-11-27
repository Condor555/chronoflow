# Audit cumulativo — Chrono Flow 2.9.4 → 3.0.5 → 3.1.0

## Obiettivo

Ripristinare integralmente la UI/UX e le funzioni della baseline stabile 2.9.4, conservando le correzioni di stabilità 3.0.5 e la condivisione calendario introdotta in 3.0.x. Nessuna modifica a `src/config.js`, schema SQL, migrazioni, policy RLS o dati.

## Metodo

Sono stati ricostruiti e confrontati gli alberi effettivi delle release 2.9.4 e 3.0.5. La 3.0.5 è stata ricostruita applicando in sequenza la 3.0.0 completa e le hotfix 3.0.1, 3.0.2, 3.0.3, 3.0.4 e 3.0.5.

### Differenza file 2.9.4 → 3.0.5

- 34 file aggiunti, principalmente condivisione calendario, bootstrap versionato e test di stabilità.
- 25 file della 2.9.4 assenti nella 3.0.5, inclusi l’applicativo completo, motore di calcolo, live clock, migrazione locale, esperienza PWA, icone e test funzionali.
- 12 file modificati, inclusi `index.html`, `styles.css`, `manifest.webmanifest`, `package.json`, `src/home-display.mjs` e service worker.

## Regressioni individuate

### Navigazione e account

La 2.9.4 offriva quattro destinazioni principali: **Oggi, Calendario, Riepilogo, Impostazioni**, più un pannello Profilo/account con nome, email e logout. La 3.0.5 esponeva soltanto Oggi, Calendario ed Esci nell’header, eliminando Riepilogo, Impostazioni, Profilo/account e la bottom navigation mobile.

### Oggi

La 3.0.5 sostituiva la Home completa con una vista minima di ingresso. Risultavano assenti o ridotti:

- grande tile/card timer della 2.9.4;
- colori solidi coordinati Ufficio `#d6ecff`, Casa `#d8f4e8`, Trasferta `#ebe2ff`;
- contatore realtime ordinario e straordinario;
- pausa/ripresa e uscita;
- metriche Ore lavorate, Uscita prevista, Straordinario, Buono pasto;
- Dettagli e correzioni;
- sabato lavorativo, notifiche e feedback completi.

### Calendario

Il Calendario personale 2.9.4 — con pianificazione multipla, selettore mese/anno, griglia coerente col design system e modifica completa della giornata — era stato sostituito dalla nuova vista di condivisione. La vista 3.0.5 era stabile ma visivamente spoglia su desktop e non preservava il modello personale completo.

### Riepilogo

L’intera sezione era assente nella 3.0.5, comprese:

- sintesi mensile;
- saldi annuali;
- ferie, festività soppresse e recuperi;
- straordinario netto/lordo e movimenti;
- buoni pasto;
- tabella annuale;
- genitorialità, maternità, paternità, malattia bambino e congedi;
- progressive disclosure e filtri guidati dalle preferenze.

### Impostazioni

L’intera sezione era assente nella 3.0.5. Erano quindi irraggiungibili Profilo lavorativo, modalità, straordinari, pause, ferie, buoni pasto, causali, preferenze Riepilogo, notifiche, famiglia, festività, sicurezza e dati.

### Funzioni collaterali

La 3.0.5 completa non conteneva più i moduli della 2.9.4 per motore di calcolo, clock realtime, importazione/migrazione locale e installazione PWA. Anche icone e test completi della baseline risultavano assenti.

## Correzioni 3.0.5 conservate

Il ripristino mantiene:

- client Supabase versionato compatibile con `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`;
- nessuna dipendenza da `SUPABASE_ANON_KEY` nel grafo attivo;
- apertura iniziale su Oggi dopo login, reload e riapertura PWA;
- caricamento lazy della condivisione calendario;
- normalizzazione sicura di record `null`, `undefined`, vuoti o incompleti;
- fallback Calendar isolato che non blocca Home;
- service worker network-first per navigazioni, JavaScript e CSS;
- attesa di `preloadResponse`, disattivazione navigation preload e pulizia cache precedenti;
- UI di inviti, revoca, privacy selettiva e confronto settimanale;
- RPC e RLS della migrazione esistente, senza modifiche.

## Integrazione calendario finale

Il Calendario ora contiene:

- **Il mio**: calendario personale 2.9.4 completo;
- **Condivisi**: calendari ricevuti, confronto settimanale e gestione privacy;
- condivisione caricata soltanto al primo accesso;
- sincronizzazione non distruttiva della proiezione condivisa a partire dai dati personali già caricati;
- accesso alla gestione anche da Impostazioni → Condivisione calendario.

## Nuova regola Smart Working

Quando `Calcola straordinario in Smart Working` è disattivato:

1. l’utente registra l’ingresso;
2. può registrare una pausa effettiva, se prevista;
3. l’uscita è calcolata come ingresso + monte ore giornaliero + pausa standard, oppure pausa effettiva se registrata;
4. la UI mostra `Uscita automatica alle HH:MM`;
5. `Registra uscita` non viene mostrato;
6. al raggiungimento dell’istante, viene salvato un evento di uscita automatica esattamente all’orario calcolato;
7. il timer ordinario si ferma al monte ore e lo straordinario resta zero;
8. modifiche successive ricalcolano l’uscita; i precedenti eventi automatici sono conservati come superseded, quindi non alterano i calcoli ma restano nello storico JSON;
9. attivando lo straordinario Smart, l’uscita automatica corrente viene resa storica e torna il flusso manuale/realtime.

La regola non viene applicata automaticamente a Ufficio o Trasferta.

## Verifica

La suite cumulativa comprende 136 test automatici e copre baseline 2.9.x, stabilità 3.0.5, condivisione, routing, cache, UI ripristinata e nuova uscita automatica Smart.
