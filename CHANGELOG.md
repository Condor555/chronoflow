# Changelog

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
