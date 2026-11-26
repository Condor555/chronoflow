# Chrono Flow — multiutente

**Chrono Flow** è la PWA mobile-first per registrare entrata, pausa, uscita, Smart Working, ufficio, trasferte, assenze, straordinari e buoni pasto.

La versione 2 aggiunge **account personali e salvataggio nel cloud**: ogni utente accede con la propria email e vede esclusivamente le proprie giornate. La separazione è applicata nel database tramite **Row Level Security (RLS)**, non soltanto nell’interfaccia.

## Configurazione personale e Riepilogo

Le Impostazioni determinano quali modalità, causali e istituti sono applicabili al singolo account. Disattivare una voce la rimuove dalle scelte ordinarie e dal Riepilogo, ma non cancella le giornate già salvate. Le voci con utilizzi reali o saldi ancora rilevanti restano consultabili.

Il Riepilogo mostra in primo piano solo ore lavorate, straordinario residuo e buoni pasto. Maturato, compensazioni, rettifiche, date e dati da classificare restano disponibili nei dettagli espandibili. Per Malattia bambino viene mostrato un solo periodo attivo per figlio; i periodi conclusi rimangono nello storico.

## Funzioni incluse

- registrazione rapida di Entrata, Inizia pausa, Termina pausa e Uscita;
- scelta immediata dalla home tra **Ufficio, Casa e Trasferta**;
- card timer con tema accessibile specifico per modalità e indicazione testuale sempre visibile;
- uscita prevista, ore lavorate e straordinario aggiornati realmente al secondo, con riavvio sicuro del clock dopo background/PWA e senza timer duplicati;
- pausa configurata applicata automaticamente se non viene registrata; una pausa manuale sostituisce quella predefinita senza doppio conteggio;
- straordinario in Smart Working e trasferta configurabile separatamente e disattivato di default;
- notifica opzionale sul dispositivo all’orario di uscita previsto;
- pianificato ed effettivo separati: Ufficio, Smart Working, Trasferta, Assenza;
- modifica dal calendario degli orari di ingresso, pausa e uscita;
- ferie, malattia, malattia bambino, congedo parentale facoltativo, maternità obbligatoria, paternità obbligatoria e alternativa, congedo matrimoniale, recuperi e festività;
- calendario mensile con stato indicato da colore **e** sigla testuale;
- riepilogo mensile e annuale con stato corrente in primo piano e calcoli completi disponibili nei dettagli espandibili;
- tracciabilità per causale: ogni saldo apre l’elenco delle date che lo compongono, senza accorpare maternità, paternità, congedi o recuperi diversi;
- bilancio annuale con ferie dell’anno precedente e corrente, festività soppresse, recuperi, residuo e rapporto `utilizzati / disponibili`;
- MonthSelector Chrono Flow coerente tra Calendario e Riepilogo e card espandibili separate per assenze del mese e dell’anno;
- orario giornaliero, pause, soglia straordinario e ticket configurabili;
- elenco figli e associazione alle assenze che riguardano il minore;
- malattia bambino separata per figlio: 30 giorni per anno di vita fino al 3° compleanno, poi 10 giorni per anno solare fino a 14 anni, con storico dei periodi;
- congedo parentale con quota personale configurabile in mesi per figlio/evento, distinta dai limiti legali individuali e di coppia;
- area temporanea **Dati da sistemare** per riclassificare o associare lo storico importato, con conferma e annullamento;
- paternità obbligatoria separata per figlio/evento: 10 giorni (20 per parto plurimo), finestra −2/+5 mesi, scadenza e residuo storico;
- maternità obbligatoria separata per figlio/evento con modalità configurabile 2+3, 1+4 o 0+5, periodo e certificazioni evidenziati;
- una sola regola per le festività cadute di domenica: **matura 1 giorno**, **solo compensazione economica**, **nessun recupero** o **gestione manuale**;
- rilevamento automatico delle festività riconosciute cadute di domenica, saldo annuale maturati/utilizzati/disponibili e scalo quando usi **Recupero festività**;
- buoni pasto secondo regole consolidate: Ufficio/Smart/Trasferta per default, esclusione automatica di assenze, recuperi e sabato lavorativo, rettifiche esplicite e competenza differita di due mesi;
- accesso email/password obbligatorio: senza una sessione valida l’app non mostra giornate o impostazioni;
- sessione persistente sul dispositivo, revocabile con **Esci da questo dispositivo**;
- dati sincronizzati tra dispositivi;
- coda locale offline: le modifiche vengono inviate al ritorno della connessione;
- annullamento rapido dell’ultima timbratura e del ripristino di una giornata eliminata;
- esportazione e importazione di backup JSON;
- migrazione guidata dei dati anonimi creati con l’MVP o con le prime versioni multiutente;
- banner di installazione PWA con prompt nativo dove disponibile e istruzioni **Condividi → Aggiungi alla schermata Home** su iPhone/iPad;
- card Impostazioni richiudibili con riepilogo dello stato, empty state espliciti e design system coerente per pulsanti e icone SVG;
- interfaccia rivista per focus visibile, target touch da 44 px, screen reader, movimento ridotto e microcopy esplicita.

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

## Aggiornamento dalla 2.9.1 alla 2.9.2

1. Non rieseguire l’importazione iniziale dei dati.
2. Non serve una nuova query SQL: questa release aggiorna interfaccia, calcoli e configurazione personale senza modificare lo schema Supabase.
3. Sostituisci nella repository GitHub i file con quelli di questo pacchetto, mantenendo `src/config.js` già configurato.
4. Esegui il commit e attendi GitHub Pages.
5. Chiudi completamente la PWA e riaprila. La cache passa a `chrono-flow-v2.9.2` e aggiorna anche foglio di stile e modulo dei temi Home con strategia network-first.

Le giornate, le timbrature, i dati importati e le impostazioni già salvate non vengono modificati. Non serve alcuna query SQL: massimali e rettifiche del nuovo bilancio annuale vengono salvati nel JSON protetto del profilo già esistente.

Le nuove informazioni per figlio/evento, inclusa la quota personale di congedo parentale, sono salvate nello stesso `family_settings` JSON già presente nel profilo. I record storici senza `child_id` non vengono duplicati: **Dati da sistemare** permette di aggiornarli in sicurezza e di annullare l’ultima riclassificazione.


Al primo avvio i massimali predefiniti sono **20 giorni di ferie dell’anno corrente** e **4 festività soppresse**. In **Impostazioni → Ferie e festività soppresse** puoi configurarli per ogni anno. Al cambio anno il residuo e gli ultimi valori configurati vengono riportati automaticamente; la rettifica opzionale resta un’eccezione per allineare un saldo iniziale diverso.

## Avvio rapido

### 1. Crea il backend Supabase

1. Crea un nuovo progetto dal pannello Supabase.
2. Apri **SQL Editor**.
3. Copia tutto il contenuto di `supabase/schema.sql`.
4. Esegui lo script una sola volta.
5. Facoltativo ma consigliato: esegui `supabase/verify.sql`. Per `profiles` e `work_days`, `rowsecurity` deve risultare `true` e devono comparire le policy create dallo script.

Se il progetto usa già Chrono Flow 2.2, non rieseguire l’intero schema: esegui una sola volta `supabase/migrate-v2.3.0.sql`. La migrazione amplia soltanto le tipologie di assenza accettate e non modifica o cancella le giornate esistenti.

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

Dalla versione 2.3 Chrono Flow usa una strategia *network-first* per shell, configurazione e codice principale. Dopo il deploy apri il sito online e attendi l’eventuale ricaricamento automatico; se una vecchia PWA era già aperta, chiudila e riaprila una volta.

## Verifica multiutente consigliata

1. Crea `utente-a@example.com` e registra una giornata.
2. Esci con **Esci da questo dispositivo**.
3. Crea `utente-b@example.com`.
4. Controlla che il calendario del secondo account non mostri la giornata del primo.
5. Accedi di nuovo come utente A da un secondo browser e controlla che la giornata sia sincronizzata.
6. In modalità offline registra una modifica, poi riattiva la rete: lo stato in alto deve passare da “modifiche da sincronizzare” a “Sincronizzato”.

## Backup e migrazione dei dati locali

Da **Impostazioni → I tuoi dati** puoi:

- scaricare tutte le giornate dell’account in JSON;
- importare un backup della versione 2 senza cancellare le altre giornate.

L’importazione manuale usa la data come chiave: una giornata già presente viene aggiornata, una data nuova viene aggiunta.

Al primo accesso, Chrono Flow controlla anche la presenza di dati anonimi lasciati sullo stesso browser da:

- `orari-mobile-mvp-v1`;
- `orari:v2:*:anonymous`;
- `chrono-flow:v2:*:anonymous`.

Se trova dati validi, mostra una scelta esplicita:

- **Importa nel mio account**: converte giornate, timbrature e impostazioni supportate, assegna i dati all’utente autenticato e mantiene la versione cloud quando la stessa data esiste già;
- **Ignora**: non importa e non elimina nulla. La verifica può essere riaperta da **Impostazioni → I tuoi dati → Controlla dati locali precedenti**.

Le vecchie chiavi locali vengono eliminate soltanto quando tutti i salvataggi richiesti sono stati confermati da Supabase. In caso di errore o assenza di rete restano intatte. I contenuti non leggibili non vengono cancellati automaticamente.

Per dati importanti è comunque consigliato:

1. conserva una copia del file originale;
2. prova con un account di test;
3. verifica date, timbrature, modalità e assenze.

## Utilizzo offline

Dopo il primo caricamento, la shell dell’app è disponibile offline. Le modifiche alle giornate vengono salvate nel browser e messe in coda per Supabase. Quando torna la connessione, l’app tenta la sincronizzazione.

Limitazioni:

- il primo accesso e la creazione dell’account richiedono la rete;
- se lo stesso giorno viene modificato offline su due dispositivi, prevale l’ultima versione sincronizzata;
- prima di cancellare dati del browser, verifica che lo stato mostri “Sincronizzato”.

## Notifica dell’uscita

La notifica è una preferenza del singolo dispositivo. Va attivata da **Impostazioni → Notifica dell’uscita** e richiede il consenso del browser. L’orario deriva dalla prima entrata, dalle ore giornaliere e dalla pausa del tipo di presenza scelto; una pausa effettiva più lunga aggiorna la previsione.

Le PWA non dispongono di una pianificazione locale affidabile su ogni sistema operativo quando sono state forzatamente chiuse. Per la migliore affidabilità installa Chrono Flow, consenti le notifiche e lascia che il sistema la mantenga in background. Questa versione non usa un servizio push remoto.

Su iPhone e iPad il browser non espone il normale prompt automatico di installazione. Chrono Flow mostra quindi un banner dedicato con il percorso **Condividi → Aggiungi alla schermata Home**. Il banner non compare quando l’app è già aperta in modalità standalone; se viene chiuso, resta nascosto per sette giorni. Nella sezione notifiche, l’app mostra le stesse istruzioni finché non viene aperta dalla schermata Home.

## Straordinario per tipologia

La soglia straordinario configurata nel profilo continua ad applicarsi sempre alle giornate in ufficio. In **Impostazioni → Profilo lavorativo** sono disponibili due opzioni indipendenti:

- **Calcola straordinario in Smart Working**;
- **Calcola straordinario in trasferta**.

Entrambe sono disattivate di default. Quando una voce è disattivata, le ore lavorate restano nel totale della giornata ma l’eccedenza non confluisce nello straordinario di oggi né nel riepilogo mensile. Quando viene attivata, si applicano la normale durata giornaliera e la soglia straordinario già impostata.

## Regole assenze implementate

- **Malattia bambino:** fino al 3° compleanno la durata dell’assenza segue la malattia; la quota di 30 giorni retribuiti viene conteggiata per ciascun anno di vita, non per anno solare. Dai 3 ai 14 anni vengono conteggiati 10 giorni lavorativi per anno solare. Gli utilizzi fuori app o dell’altro genitore si inseriscono per il periodo corrente.
- **Congedo parentale facoltativo:** collegabile al figlio fino ai 14 anni. Chrono Flow conta le giornate registrate, ma non sostituisce il calcolo INPS dei mesi individuali, di coppia e indennizzabili.
- **Maternità obbligatoria, paternità obbligatoria e paternità alternativa:** sono voci separate e collegabili al figlio. La paternità alternativa va usata soltanto nei casi previsti dalla legge.
- **Congedo matrimoniale:** è una voce autonoma e non è collegata al figlio.
- **Festività caduta di domenica:** nessun credito viene creato automaticamente. L’utente deve configurare la regola contrattuale e il numero di giornate autorizzate; gli utilizzi sono registrati come voce autonoma.
- **Ticket:** ogni giornata con tipo effettivo o pianificato “Assenza” restituisce sempre “No”, anche se un vecchio backup conteneva un override positivo.

Questi contatori sono un supporto personale. La titolarità, la durata, l’indennità e la documentazione vanno confermate con INPS, CCNL applicabile e Ufficio del Personale.

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
│   ├── migration.mjs
│   ├── config.js
│   └── config.example.js
├── supabase/
│   ├── schema.sql
│   ├── migrate-v2.3.0.sql
│   └── verify.sql
├── tests/
│   ├── calculations.test.mjs
│   └── migration.test.mjs
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
