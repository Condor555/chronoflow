# Chrono Flow 3.3.1

Patch incrementale sulla baseline stabile 3.3.0.

## Commesse

- ricerca per codice o descrizione mentre si scrive;
- selezione di più commesse nella stessa finestra `Registra attività`;
- rimozione del concetto `Intervallo della giornata`;
- ripartizione automatica dell’orario lavorato: 100% con una commessa, 50% + 50% con due, parti uguali con tre o più;
- alternativa con ore manuali specifiche per ogni commessa;
- ricalcolo delle sole allocazioni automatiche quando cambiano modalità o orari della giornata;
- nessun elemento Commesse nelle viste operative quando la funzione è disattivata.

## Modalità Home e Calendario

- la Home renderizza subito la giornata odierna già salvata, invece del valore statico Ufficio;
- la giornata odierna viene riletta dal cloud a riapertura Home, ritorno in primo piano, `pageshow`, refresh e nuova sessione;
- le modifiche locali ancora in coda non vengono sovrascritte da una lettura remota;
- Ufficio resta il default soltanto se oggi non esiste una giornata salvata;
- il cambio modalità dalla Home aggiorna la stessa riga `work_days` tramite conflitto `user_id,work_date`.

## Calendario personale

- ripristinato e protetto il dettaglio editabile della giornata;
- modifica di pianificato/effettivo, assenza e causale, figlio quando applicabile, ingresso, uscita, pausa, ticket, note e Commesse;
- il form non usa più la chiusura nativa `method=dialog`, evitando salvataggi interrotti;
- aggiornamento immediato di Home, Calendario e Riepilogo;
- Calendario condiviso esplicitamente in sola lettura.

## Verifiche

- suite completa ricostruita: **189/189 test superati**;
- suite focalizzata 3.3.1: **24/24 test superati**;
- verifica Chromium a 390×844 e 1440×1000: nessun overflow orizzontale nel nuovo dialog Commesse;
- `src/config.js` non incluso e non modificato.
