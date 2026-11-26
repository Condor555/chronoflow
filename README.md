# Orari Mobile — MVP PWA

Applicazione web mobile-first installabile su smartphone per gestire:

- entrata, pause e uscita effettiva;
- uscita prevista per giornate da 7:36, 8:00 o durata personalizzata;
- pianificazione e consuntivo separati per ufficio, smart working e trasferta;
- ferie, malattia, congedi, festività soppresse, recuperi e malattia bambino;
- straordinari con soglia, franchigia, arrotondamento e trattamento pagato/recupero;
- ticket configurabili per modalità e modificabili sul singolo giorno;
- calendario mensile, pianificazione in blocco e riepilogo mensile/annuale;
- figli e policy configurabili per il calcolo del residuo di malattia bambino;
- esportazione CSV e backup/ripristino JSON;
- uso offline dopo il primo caricamento.

Le **commesse sono volutamente escluse dalla versione 1**.

## Scelte dell’MVP

L’app è una PWA statica senza framework, server, database o servizi a pagamento. I dati sono conservati nel `localStorage` del browser del dispositivo. Questa scelta rende la prima versione semplice da pubblicare e priva di costi infrastrutturali, ma implica che:

- i dati non si sincronizzano automaticamente tra dispositivi;
- cancellare i dati del browser elimina anche i dati dell’app;
- è importante esportare periodicamente il backup JSON;
- il backup può essere importato su un altro dispositivo.

La pubblicazione distribuisce **solo il codice dell’app vuota**: i dati personali inseriti sul telefono non vengono inviati a GitHub.

## Pubblicazione gratuita su GitHub Pages

### 1. Crea il repository

1. Accedi a GitHub e scegli **New repository**.
2. Nome consigliato: `orari-mobile`.
3. Impostalo **Public**. GitHub Pages sui repository pubblici è disponibile senza acquistare servizi aggiuntivi.
4. Non aggiungere README o altri file durante la creazione, perché sono già inclusi qui.

### 2. Carica i file dal browser

1. Estrai lo ZIP ricevuto.
2. Apri il repository e scegli **Add file → Upload files**.
3. Trascina **il contenuto della cartella** `orari-mobile-mvp`, non la cartella ZIP.
4. Verifica che `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `src/` e `icons/` siano nella radice del repository.
5. Conferma con **Commit changes**.

Se il browser non mantiene le cartelle trascinate, crea prima `src` e `icons` nel repository oppure usa GitHub Desktop. Non modificare i percorsi dei file.

### 3. Attiva GitHub Pages

1. Vai in **Settings → Pages**.
2. In **Build and deployment**, scegli **Deploy from a branch**.
3. Seleziona branch `main` e cartella `/ (root)`.
4. Premi **Save**.
5. Attendi alcuni minuti e apri l’indirizzo mostrato da GitHub, simile a `https://NOMEUTENTE.github.io/orari-mobile/`.

Non sono necessari GitHub Actions, database, token, domini personalizzati o carte di credito. Per evitare costi imprevisti, non attivare servizi cloud aggiuntivi e non trasformare il progetto in repository privato se il tuo piano non include Pages per repository privati.

## Installazione sul telefono

### Android / Chrome

1. Apri l’URL GitHub Pages.
2. Usa **Installa app** dal menu di Chrome o il pulsante di installazione mostrato nell’intestazione.
3. Conferma **Installa**.

### iPhone / Safari

1. Apri l’URL in Safari.
2. Tocca **Condividi**.
3. Scegli **Aggiungi alla schermata Home**.

Dopo il primo caricamento online, l’app può aprirsi anche offline. Quando pubblichi una nuova versione, chiudi e riapri l’app con connessione attiva per ricevere i file aggiornati.

## Primo avvio consigliato

1. Apri **Impostazioni → Giornata tipo** e verifica durata, pause e ingresso smart suggerito.
2. Configura le regole ticket e straordinario.
3. Inserisci ferie disponibili e recuperi.
4. Se necessario, aggiungi i figli e poi le fasce della policy malattia bambino.
5. Esporta un primo backup JSON dopo la configurazione.

Le policy per malattia bambino non contengono limiti normativi preimpostati: vanno compilate in base alla normativa, al contratto e agli accordi applicabili. L’app effettua un conteggio operativo e non sostituisce la verifica dell’amministrazione del personale.

## Avvio locale facoltativo

Non aprire `index.html` con doppio clic: service worker e moduli JavaScript richiedono un server HTTP.

```bash
python3 -m http.server 8080
```

Poi apri `http://localhost:8080`.

## Test dei calcoli

Con Node.js 20 o successivo:

```bash
npm test
```

I test coprono gli esempi principali del foglio: uscita 16:41 da ingresso 08:35 con 7:36 + 30 minuti, uscita smart 17:36 da ingresso 09:00 con pausa di un’ora, straordinari, ticket, riepiloghi e residuo malattia bambino.

## Struttura

```text
index.html                 interfaccia
styles.css                 stile responsive
manifest.webmanifest       installazione PWA
sw.js                      cache offline
src/app.js                 interazioni e schermate
src/engine.js              motore dei calcoli
src/storage.js             persistenza locale e valori iniziali
icons/                     icone installabili
tests/engine.test.mjs      test automatici
```

## Dati e privacy

- Nessun dato viene inviato a un backend.
- Non sono presenti analytics, cookie di profilazione o librerie di terze parti.
- I dati di famiglia restano nel browser finché non vengono esportati manualmente.
- Un repository pubblico espone il codice, non i dati inseriti nell’app.

## Limiti noti della versione 1

- niente sincronizzazione multi-dispositivo o autenticazione;
- assenze conteggiate a giornata intera;
- una pausa modificabile dal dettaglio giorno; durante la timbratura rapida sono ammesse più pause;
- nessun flusso di approvazione;
- nessuna commessa o allocazione ore;
- nessuna importazione diretta del file XLSM; lo storico può essere ricostruito manualmente o aggiunto in una versione successiva con una procedura di migrazione dedicata.
