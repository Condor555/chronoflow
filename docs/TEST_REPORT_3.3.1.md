# Rapporto verifiche Chrono Flow 3.3.1

Data verifica: 27 novembre 2026.

## Suite completa

Comando: `npm test`

- test: 189
- superati: 189
- falliti: 0
- ignorati: 0

La suite è stata eseguita sulla repository completa ricostruita in ordine dalla 3.0.0 alla 3.3.0 e poi aggiornata con i file 3.3.1.

## Suite focalizzata

Comando: `npm run check`

- test: 24
- superati: 24
- falliti: 0

Copertura specifica: ricerca e selezione multipla Commesse, ripartizione automatica 1/2/3 commesse, ore manuali, modalità odierna Smart/Trasferta/default Ufficio, coda offline, modifica Calendario personale, assenze, no duplicati, riflesso Home/Riepilogo, Commesse ON/OFF, Calendario condiviso read-only e service worker 3.3.1.

## Browser

Chromium headless:

- viewport mobile: 390×844;
- viewport desktop: 1440×1000;
- dialog multi-commessa entro il viewport;
- radio e checkbox con dimensioni corrette;
- nessun overflow orizzontale.
