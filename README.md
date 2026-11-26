# Chrono Flow — multiutente

**Chrono Flow** è la PWA mobile-first per registrare entrata, pausa, uscita, Smart Working, ufficio, trasferte, assenze, straordinari e buoni pasto.

La versione 2 aggiunge **account personali e salvataggio nel cloud**: ogni utente accede con la propria email e vede esclusivamente le proprie giornate. La separazione è applicata nel database tramite **Row Level Security (RLS)**, non soltanto nell’interfaccia.

## Funzioni incluse

- registrazione rapida di Entrata, Inizia pausa, Termina pausa e Uscita;
- uscita prevista, ore lavorate e straordinario aggiornati durante la giornata;
- pianificato ed effettivo separati: Ufficio, Smart Working, Trasferta, Assenza;
- ferie, malattia, malattia bambino, congedo, recupero e festività;
- calendario mensile con stato indicato da colore **e** sigla testuale;
- riepilogo mensile di ore, straordinario, ticket e tipologia delle giornate;
- orario giornaliero, pause, soglia straordinario e ticket configurabili;
- elenco figli e associazione alla malattia bambino;
- account email/password e sessione persistente;
- dati sincronizzati tra dispositivi;
- coda locale offline: le modifiche vengono inviate al ritorno della connessione;
- annullamento rapido dell’ultima timbratura e del ripristino di una giornata eliminata;
- esportazione e importazione di backup JSON;
- PWA installabile su Android/iPhone dopo la pubblicazione HTTPS;
- interfaccia rivista per focus visibile, target touch, screen reader e microcopy esplicita.

## Architettura

```text
Browser / PWA
    │
    ├── Supabase Auth (account e sessione)
    │
    └── PostgreSQL Supabase
          ├── profiles
          └── work_days
                └── RLS: auth.uid() = user_id
```

La chiave `anon` è progettata per essere usata nel browser ed è quindi pubblica. La protezione dipende dalle policy RLS incluse in `supabase/schema.sql`. **Non inserire mai la chiave `service_role` nel sito o nella repository.**

## Avvio rapido

### 1. Crea il backend Supabase

1. Crea un nuovo progetto dal pannello Supabase.
2. Apri **SQL Editor**.
3. Copia tutto il contenuto di `supabase/schema.sql`.
4. Esegui lo script una sola volta.
5. Facoltativo ma consigliato: esegui `supabase/verify.sql`. Per `profiles` e `work_days`, `rowsecurity` deve risultare `true` e devono comparire le policy create dallo script.

Lo script crea:

- profilo automatico per ogni nuovo account;
- vincoli per i valori accettati;
- indice sulle giornate;
- trigger `updated_at`;
- cancellazione dei dati collegati quando un account viene cancellato;
- policy che impediscono a un utente di leggere o modificare dati di altri utenti.

### 2. Configura l’autenticazione

Nel pannello Supabase:

1. apri **Authentication → URL Configuration**;
2. imposta come **Site URL** l’indirizzo finale del sito, ad esempio `https://NOMEUTENTE.github.io/chrono-flow/`;
3. aggiungi lo stesso indirizzo tra i **Redirect URLs**;
4. in **Authentication → Providers → Email** scegli se richiedere la conferma email;
5. decidi chi può registrarsi: per un sito aperto lascia attive le nuove registrazioni; per un gruppo chiuso disattivale e invita gli utenti dal pannello Supabase.

Il link “reimposta password” riporta all’app: dopo l’apertura, vai alla sezione Sicurezza account (aperta automaticamente) e salva la nuova password.

Durante lo sviluppo locale aggiungi anche `http://localhost:4173/` ai Redirect URLs.

### 3. Collega il frontend

Nel pannello Supabase apri le impostazioni API del progetto e recupera:

- Project URL;
- chiave `anon`/`publishable` destinata al client.

Modifica `src/config.js`:

```js
window.CHRONO_FLOW_CONFIG = {
  supabaseUrl: "https://TUO-PROGETTO.supabase.co",
  supabaseAnonKey: "LA-TUA-CHIAVE-ANON-PUBBLICA"
};
```

Non usare la chiave `service_role`.

### 4. Prova in locale

Serve un web server; non aprire `index.html` con `file://`.

```bash
npm test
npm run serve
```

Apri `http://localhost:4173/`, crea due account di prova e verifica che le giornate create dal primo non siano visibili dal secondo.

### 5. Pubblica con GitHub Pages

1. Crea una repository, per esempio `chrono-flow`.
2. Carica **il contenuto** di questa cartella nella root della repository.
3. Controlla che `src/config.js` contenga i dati del progetto Supabase.
4. In GitHub apri **Settings → Pages**.
5. Seleziona **Deploy from a branch**, branch `main`, cartella `/ (root)`.
6. Salva e attendi l’indirizzo HTTPS.
7. Riporta l’indirizzo esatto nelle impostazioni URL di Supabase, come descritto sopra.

## Verifica multiutente consigliata

1. Crea `utente-a@example.com` e registra una giornata.
2. Esci con **Esci da questo dispositivo**.
3. Crea `utente-b@example.com`.
4. Controlla che il calendario del secondo account non mostri la giornata del primo.
5. Accedi di nuovo come utente A da un secondo browser e controlla che la giornata sia sincronizzata.
6. In modalità offline registra una modifica, poi riattiva la rete: lo stato in alto deve passare da “modifiche da sincronizzare” a “Sincronizzato”.

## Backup e passaggio dalla versione precedente

Da **Impostazioni → I tuoi dati** puoi:

- scaricare tutte le giornate dell’account in JSON;
- importare un backup della versione 2 senza cancellare le altre giornate.

L’importazione usa la data come chiave: una giornata già presente viene aggiornata, una data nuova viene aggiunta.

I backup della precedente versione locale potrebbero avere una struttura diversa. Prima di importare dati importanti:

1. conserva una copia del file originale;
2. prova con un account di test;
3. verifica date, timbrature, modalità e assenze.

## Utilizzo offline

Dopo il primo caricamento, la shell dell’app è disponibile offline. Le modifiche alle giornate vengono salvate nel browser e messe in coda per Supabase. Quando torna la connessione, l’app tenta la sincronizzazione.

Limitazioni:

- il primo accesso e la creazione dell’account richiedono la rete;
- se lo stesso giorno viene modificato offline su due dispositivi, prevale l’ultima versione sincronizzata;
- prima di cancellare dati del browser, verifica che lo stato mostri “Sincronizzato”.

## Accessibilità e UX

La UI include:

- target interattivi principali di almeno 44 CSS px;
- contrasto elevato e focus visibile;
- etichette esplicite per tutti i campi;
- stati del calendario comunicati con sigla, testo accessibile e colore;
- regioni live per conferme ed errori;
- supporto a `prefers-reduced-motion` e `prefers-contrast`;
- azioni nominate in modo specifico: “Registra entrata”, “Termina pausa”, “Salva la giornata”;
- feedback di sincronizzazione e annullamento rapido.

Per un rilascio pubblico è comunque raccomandato un audit manuale con tastiera, VoiceOver/TalkBack, zoom 200% e un controllo automatico WCAG sulla versione pubblicata.

## Identità visiva

L’identità di Chrono Flow traduce i concetti di **tempo, continuità e controllo** in un sistema essenziale:

- il simbolo è una **C aperta** che funziona anche come quadrante, con lancette color acqua che suggeriscono il flusso;
- blu notte `#102A43` per affidabilità e concentrazione;
- verde acqua `#0B7773` e menta `#53D6C7` per azioni, avanzamento e sincronizzazione;
- superfici chiare e ombre contenute per mantenere leggibilità anche durante l’uso rapido da smartphone;
- colore sempre accompagnato da testo, sigle o icone per non perdere informazione in condizioni di daltonismo.

La cartella `icons/` contiene l’icona vettoriale, le varianti PNG, l’icona adattiva maskable e l’icona Apple Touch.

## Struttura della repository

```text
.
├── index.html
├── styles.css
├── sw.js
├── manifest.webmanifest
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable.svg
│   ├── icon-maskable-512.png
│   └── apple-touch-icon.png
├── src/
│   ├── app.js
│   ├── calculations.mjs
│   ├── config.js
│   └── config.example.js
├── supabase/
│   ├── schema.sql
│   └── verify.sql
├── tests/
│   └── calculations.test.mjs
├── CHANGELOG.md
├── LICENSE
└── package.json
```

## Dati personali e produzione

L’app può contenere informazioni su presenze, assenze e famiglia. Prima di usarla in un’organizzazione:

- definisci titolare, finalità, base giuridica, tempi di conservazione e procedura di cancellazione;
- valuta se i dati relativi alle assenze richiedono misure aggiuntive;
- abilita MFA se coerente con il contesto d’uso;
- limita l’accesso al progetto Supabase;
- configura backup, monitoraggio e un dominio appropriato;
- verifica periodicamente che RLS resti attiva;
- non memorizzare diagnosi o dettagli sanitari non necessari nelle note.

Questa repository implementa la separazione tecnica per utente, ma non sostituisce la valutazione privacy e sicurezza necessaria per un servizio di produzione.

## Test

I test non richiedono dipendenze esterne:

```bash
npm test
```

Coprono il calcolo della giornata da 7:36, la previsione `08:35 → 16:41`, le pause, la soglia straordinario, la formattazione delle durate e le regole ticket.
