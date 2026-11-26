# Changelog

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
