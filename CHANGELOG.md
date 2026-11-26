# Changelog

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
