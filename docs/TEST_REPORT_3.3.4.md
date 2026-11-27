# Test report Chrono Flow 3.3.4

Data: 2026-11-27  
Baseline: 3.3.3

## Esito

| Comando | Test | Superati | Falliti |
|---|---:|---:|---:|
| `npm run check` | 67 | 67 | 0 |
| `npm test` | 220 | 220 | 0 |

## Copertura della correzione

- apertura di una nuova registrazione con selezione iniziale vuota;
- esclusione della commessa storica o preferita dalla preselezione automatica;
- conservazione delle sole selezioni effettuate dall’utente nella sessione corrente;
- svuotamento della ricerca e ripristino dell’elenco completo dopo ogni selezione;
- ritorno del focus nel campo di ricerca dopo ogni selezione;
- selezione multipla ripetuta senza perdita delle commesse già scelte;
- esclusione delle commesse già registrate dall’elenco delle nuove aggiunte;
- conversione percentuale → minuti e minuti → percentuale;
- dialogo di modifica singola privo di ricerca e aggiunta commesse;
- modifica della sola durata della voce esistente, mantenendo identificativo, commessa, data e metodo;
- eliminazione della sola allocazione selezionata;
- aggiornamento immediato dei totali condivisi dalle viste;
- entry point, cache e service worker immutabili 3.3.4;
- regressioni complete precedenti su Home, Calendario, Riepilogo, pausa automatica e condivisione.

## Limite della verifica automatica

Dopo il deploy resta necessario verificare sul dispositivo reale che la PWA abbia attivato il service worker 3.3.4. La logica non richiede timer in background né modifiche Supabase.
