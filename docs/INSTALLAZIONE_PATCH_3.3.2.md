# Installazione patch Chrono Flow 3.3.2

## Baseline richiesta

Applicare questa patch esclusivamente a Chrono Flow 3.3.1 già installata.

## Procedura

1. Eseguire un backup o creare un branch della repository 3.3.1.
2. Estrarre lo ZIP.
3. Copiare il contenuto della cartella patch nella root della repository, mantenendo esattamente i percorsi.
4. Sovrascrivere i file omonimi.
5. Non modificare `src/config.js`.
6. Non eseguire SQL o migration: la 3.3.2 non modifica database, RLS o dati.
7. Attendere il deploy di GitHub Pages.
8. Chiudere completamente tutte le schede e la PWA Chrono Flow, quindi riaprirla. Il service worker 3.3.2 elimina la cache precedente.

## Controllo rapido

1. Pianificare oggi come Smart Working nel Calendario personale.
2. Chiudere e riaprire la PWA: la Home deve restare Smart Working.
3. Aprire Calendario → Il mio e toccare oggi.
4. Modificare modalità, ingresso, pausa e uscita; se le Commesse sono attive, verificare che la sezione sia visibile.
5. Salvare: deve restare una sola giornata per la data e Home/Riepilogo devono aggiornarsi.
6. Aprire Calendario → Condivisi: le giornate altrui devono restare in sola lettura.
