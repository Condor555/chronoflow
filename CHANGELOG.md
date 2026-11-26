# Changelog

## 2.9.2 — regressione timer Smart e temi Home

- il limite del timer ordinario Smart Working è ora parte del risultato della policy di calcolo, non una sola trasformazione grafica;
- con straordinario Smart disattivato, una giornata arrivata a 9:07:35 mostra comunque 7:36:00 come ore ordinarie e 0:00:00 di straordinario;
- con straordinario Smart attivo, le ore ordinarie restano ferme a 7:36:00 e soltanto lo straordinario cresce al secondo dopo la soglia;
- la grande card Home usa classi DOM esplicite e persistenti `mode-office`, `mode-smart` e `mode-travel`;
- il cambio Ufficio/Casa/Trasferta aggiorna classe, token, icona e testo prima del salvataggio remoto;
- `styles.css` e il nuovo modulo di presentazione Home vengono aggiornati con strategia network-first per evitare la permanenza di asset PWA precedenti;
- aggiunti test temporali sul caso reale 9:07:35, test DOM sulle classi e test sui token distinti delle tre modalità;
- cache PWA aggiornata a `chrono-flow-v2.9.2`.

## 2.9.1 — correzioni realtime, storico classificabile e rollover annuale

- anno del selettore Riepilogo leggibile per intero anche su schermi da 320 px;
- conteggio delle festività soppresse coerente con festività nazionali e locale configurata;
- contatore Smart Working limitato al monte ore previsto e straordinario live al secondo, nel rispetto di soglia e abilitazioni per Ufficio, Smart Working e Trasferta;
- stato Home **Orario completato** al raggiungimento del monte ore e temi accessibili distinti per Ufficio, Casa/Smart Working e Trasferta, sempre accompagnati da icona e testo;
- nuova area temporanea **Dati da sistemare** per associare o riclassificare record importati, con verifica delle finestre, conferma esplicita e annullamento;
- Malattia bambino mostrata per il solo periodo attivo e per singolo figlio, senza sommare anni di vita o periodi futuri;
- quota personale di congedo parentale configurabile in mesi per figlio/evento, distinta dai limiti di legge e convertita in 30 giorni per mese;
- Riepilogo operativo ripulito dai riferimenti di sviluppo e tabella annuale essenziale con maternità, paternità e congedo parentale distinti;
- rollover automatico di ferie e festività soppresse al nuovo anno, con riporto del residuo e successione non distruttiva delle configurazioni annuali;
- cache PWA aggiornata a `chrono-flow-v2.9.1`; nessuna migrazione SQL richiesta.

## 2.9.0 — configurazione personale e Riepilogo essenziale

- Impostazioni come sorgente unica di applicabilità per modalità di lavoro, buoni pasto, assenze, famiglia e preferenze del Riepilogo;
- filtro automatico di Home, Calendario e Riepilogo senza cancellare storico o logiche di calcolo;
- soli tre KPI principali: ore lavorate, straordinario residuo e buoni pasto di competenza;
- straordinario accorpato in maturato, recuperato/compensato e residuo, con date su espansione;
- rettifiche dei buoni pasto preservate nel dettaglio tecnico e rimosse dal livello principale;
- profilo genitoriale Padre, Madre o Personalizzato e istituti attivabili per ciascun figlio/evento;
- Malattia bambino limitata al periodo attivo, con periodi scaduti nello storico e riconciliazione non distruttiva dei dati importati non collegati;
- voci storiche o non classificate visibili solo quando contengono dati reali;
- interfaccia mobile-first con progressive disclosure, microcopy semplificata e controlli accessibili.

## 2.8.1 — Riepilogo più chiaro e mobile-first

- nuova architettura del Riepilogo in quattro aree: **Mese**, **Saldi**, **Causali** e **Analisi**;
- indicatori prioritari del mese messi in primo piano, con giornate e modalità rese più compatte;
- bilancio ferie e festività mantenuto immediatamente visibile, con recuperi approfondibili su richiesta;
- causali, plafond famiglia, assenze annuali, dettaglio completo e tabella dei 12 mesi organizzati in sezioni progressive disclosure;
- navigazione rapida interna e titoli del periodo aggiornati al mese selezionato;
- layout ottimizzato per 320–430 px, con metriche leggibili, minore densità visiva e tabella annuale scorrevole;
- nessuna modifica a formule, saldi, dati Supabase o regole della versione 2.8.0;
- cache PWA aggiornata a `chrono-flow-v2.8.1`.

## 2.8.0 — Riepilogo avanzato, timer affidabile e plafond per evento

- replica delle formule di `Riepilogo_2026`/`Riepilogo_2027` con tabella mensile/annuale completa e registro delle date per ogni causale;
- separazione rigorosa fra `FESTIVO`, festività soppresse, recupero riposo festività e recupero maggiori prestazioni;
- correzione del conteggio festività soppresse e riconoscimento di San Francesco d’Assisi dal 2026; nel 2026 le festività riconosciute di domenica sono 4 ottobre e 1 novembre;
- sabato lavorativo rilevato e riepilogato separatamente, senza buono automatico;
- buoni pasto distinti tra maturati nel mese, competenza/accredito −2 mesi e rettifiche;
- straordinario lordo, recupero maggiori prestazioni esplicito e netto/residuo senza conversione automatica delle uscite anticipate;
- pausa configurata applicata quando manca una pausa manuale; la pausa effettiva sostituisce quella predefinita;
- clock Home singleton al secondo, riavviato su `visibilitychange`, `pageshow` e focus PWA senza valori stale o timer duplicati;
- malattia bambino separata per figlio e periodo, con reset al compleanno fino a 3 anni e per anno solare nella fascia 3–14;
- paternità obbligatoria per evento (10/20 giorni, finestra −2/+5 mesi) con residuo scaduto conservato;
- maternità obbligatoria per evento con scelta 2+3, 1+4 o 0+5, periodo, stato e avviso certificazioni;
- causali di maternità, paternità obbligatoria/alternativa, parentale e matrimoniale mantenute sempre distinte;
- cache PWA aggiornata a `chrono-flow-v2.8.0` e documentazione formule in `docs/CALCULATION_RULES.md`.

## 2.7.0 — Bilancio annuale ferie e festività

- nuovo bilancio annuale ispirato al modello precedente con **Ferie anno precedente**, **Ferie anno corrente**, **Festività soppresse**, **Recupero riposo festività** e **Ferie residue**;
- visualizzazione coerente `utilizzati / disponibili`, inclusa la sintesi complessiva delle ferie (per esempio `21 / 24`) e una barra di avanzamento accessibile;
- riporto delle ferie calcolato automaticamente dal residuo dell’anno precedente, usando le giornate dell’account;
- nuova card Impostazioni per i massimali annuali di ferie e festività soppresse;
- rettifica opzionale del riporto per saldi iniziali o allineamenti aziendali, senza disattivare il calcolo automatico per gli altri anni;
- causale storica `holiday` rinominata nell’interfaccia in **Festività soppresse**, senza migrazioni SQL e senza modificare i dati esistenti;
- caricamento del riepilogo esteso all’anno precedente per calcolare il riporto in modo verificabile;
- layout del bilancio ottimizzato per smartphone, con valori tabulari, stato di caricamento e avvisi in caso di superamento dei massimali;
- cache PWA aggiornata a `chrono-flow-v2.7.0`.

## 2.6.0 — Affidabilità, MonthSelector e coerenza UI/UX

- contatore Home aggiornato ogni secondo senza sovrascrivere i campi che l’utente sta modificando;
- dettaglio assenze mensile e annuale reso robusto anche per causali storiche o non ancora mappate, con empty state esplicito;
- anteprima immediata del saldo recuperi festività mentre si cambia regola, correzione o festività locale;
- nuovo MonthSelector Chrono Flow condiviso tra Calendario e Riepilogo, senza il controllo `month` nativo;
- riconciliazione dei dati cloud/locali per evitare record obsoleti, preservando le modifiche offline in coda;
- design system uniformato per pulsanti Primary, Secondary, Ghost, IconButton e Danger;
- icone SVG coerenti per navigazione, selettori, apertura/chiusura e rimozione;
- tutte le card Impostazioni trasformate in progressive disclosure con riepilogo dello stato a card chiusa;
- feedback di salvataggio ed errore più coerenti, inclusi stato del pulsante e toast distinti;
- miglioramenti WCAG 2.2 AA: focus visibile, target touch da 44 px, `aria-expanded`, `aria-controls`, empty state e rispetto di `prefers-reduced-motion`;
- regole responsive verificate per 320, 375, 390 e 430 px, oltre al layout desktop;
- cache PWA aggiornata a `chrono-flow-v2.6.0`.

## 2.5.0 — Installazione guidata e straordinario per tipologia

- aggiunto un banner di installazione PWA: usa il prompt nativo quando il browser lo rende disponibile;
- aggiunte istruzioni specifiche per iPhone/iPad: **Condividi → Aggiungi alla schermata Home**;
- il banner non compare in modalità standalone e, se chiuso, resta nascosto per sette giorni;
- corretta la sezione notifiche su iPhone/iPad: prima dell’installazione spiega come aggiungere Chrono Flow alla schermata Home invece di dichiarare il browser non compatibile;
- aggiunte le opzioni separate **Calcola straordinario in Smart Working** e **Calcola straordinario in trasferta**;
- entrambe le opzioni sono disattivate di default e, quando attive, applicano la soglia straordinario esistente;
- ridisegnato il selettore del mese nel Riepilogo per allinearlo agli altri controlli dell’interfaccia;
- sostituita la card unica dei tipi di assenza con due card native espandibili: **Assenze del mese** e **Assenze dell’anno**;
- il riepilogo annuale usa l’anno del mese selezionato e carica tutte le giornate protette dell’account per quel periodo;
- le preferenze sono salvate nel JSON protetto del profilo, senza migrazioni SQL;
- cache PWA aggiornata a `chrono-flow-v2.5.0`.

## 2.4.0 — Recuperi automatici per festività di domenica

- sostituita la precedente configurazione con quattro regole mutuamente esclusive;
- eliminato il campo principale “Giornate di recupero disponibili nell’anno”;
- aggiunto il calendario automatico delle festività nazionali italiane e l’eventuale festa locale;
- aggiunta la maturazione di +1 giorno soltanto dopo ogni festività riconosciuta caduta di domenica;
- aggiunto il riepilogo annuale **Maturati / Utilizzati / Disponibili** in Impostazioni e Riepilogo;
- il salvataggio di una giornata come **Recupero festività** scala il saldo e la rimozione della causale lo ripristina;
- bloccato un nuovo utilizzo quando la regola non prevede recuperi o il saldo è esaurito;
- aggiunta una correzione annuale secondaria, con motivazione, per crediti precedenti o rettifiche;
- mantenuta la compatibilità con il saldo manuale della 2.3.0 e con tutte le giornate importate;
- calendario arricchito con indicatore testuale delle festività, senza affidarsi soltanto al colore;
- cache PWA aggiornata a `chrono-flow-v2.4.0`;
- aggiunti 6 test automatici per festività, maturazione e saldo.

## 2.3.0 — Orari modificabili, assenze contrattuali e notifiche

- scelta rapida **Ufficio / Casa / Trasferta** ripristinata nella home;
- modifica dal calendario di ingresso, pausa e uscita;
- notifica locale opzionale all’orario di uscita previsto, calcolato da ingresso, durata e pausa;
- riepilogo mensile separato per ogni tipologia di assenza;
- malattia bambino calcolata per anno di vita fino al 3° compleanno (30 giorni retribuiti) e poi per anno solare fino a 14 anni (10 giorni lavorativi), con utilizzi esterni configurabili;
- congedo parentale facoltativo, maternità obbligatoria, paternità obbligatoria e paternità alternativa distinti e collegabili al figlio;
- congedo matrimoniale distinto;
- recupero per festività caduta di domenica attivabile solo secondo la regola contrattuale configurata e conteggiato separatamente;
- ticket sempre escluso per tutte le giornate di assenza, anche se era presente un vecchio override;
- migrazione Supabase `migrate-v2.3.0.sql` per le nuove tipologie;
- cache PWA aggiornata a `chrono-flow-v2.3.0` e apertura dell’app al tocco della notifica.

## 2.2.0 — Accesso obbligatorio e migrazione locale

- shell applicativa sempre nascosta finché non è presente una sessione Supabase;
- schermata di verifica accesso durante l’avvio, senza comparsa temporanea dei dati;
- rilevamento dei dati anonimi dell’MVP, della versione 2 e del prefisso Chrono Flow;
- dialogo esplicito **Importa nel mio account / Ignora** dopo il login;
- conversione di giornate, timbrature, assenze, figli e impostazioni supportate;
- precedenza ai dati cloud in caso di data già esistente;
- cancellazione della vecchia copia locale solo dopo la conferma del salvataggio cloud;
- possibilità di riaprire la migrazione dalle Impostazioni dopo averla ignorata;
- nuova cache `chrono-flow-v2.2.0`, aggiornamento service worker senza cache HTTP e strategia network-first per i file applicativi principali;
- test automatici aggiunti per conversione, code anonime e conservazione dei dati malformati.

## 2.1.0 — Chrono Flow

- nuovo nome Chrono Flow in interfaccia, metadati PWA, manifest e documentazione;
- nuova icona con quadrante aperto e lancette “flow”, più varianti standard, maskable e Apple Touch;
- nuova palette blu notte, verde acqua e menta applicata a shell, card, navigazione e stati principali;
- nome dei backup aggiornato a `chrono-flow-backup-AAAA-MM-GG.json`;
- migrazione non distruttiva della cache locale dal precedente prefisso `orari:v2`;
- compatibilità mantenuta con la precedente variabile di configurazione `ORARI_CONFIG`.

## 2.0.0 — Multiutente

- account personali con email e password tramite Supabase Auth;
- giornate salvate nel cloud e separate per utente con Row Level Security;
- sincronizzazione tra smartphone e browser;
- coda locale quando la connessione è assente e sincronizzazione al ritorno online;
- calendario mensile accessibile con stato testuale oltre al colore;
- pianificazione in blocco per intervallo e giorni della settimana;
- recupero e aggiornamento della password;
- home “Oggi” semplificata con Entrata, Pausa, Ripresa e Uscita;
- annullamento rapido dell’ultima timbratura o eliminazione;
- riepilogo mensile per ore, straordinari, ticket e modalità;
- profilo personale per orario giornaliero, pause, straordinario e ticket;
- dati famiglia e associazione della malattia bambino;
- backup e ripristino JSON;
- touch target, focus visibile, live region e microcopy rivisti.
