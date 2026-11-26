# Integrazione con la baseline Chrono Flow 2.9.4

La condivisione usa una proiezione privata per non concedere accesso alle tabelle operative della 2.9.4.

## Punto di sincronizzazione

Nel punto in cui la 2.9.4 ha già caricato o salvato le giornate del calendario personale:

```js
import { CalendarSharingService, mapChronoDaysToProjection } from './calendar-sharing.mjs';
import { supabase } from './supabase-client.mjs';

const sharing = new CalendarSharingService(supabase);
await sharing.upsertProjection(mapChronoDaysToProjection(giornate));
```

`giornate` può usare `date` o `work_date`, `start_time`/`end_time` o `clock_in`/`clock_out`. L'adapter conserva i campi nel perimetro privato del proprietario; è la RPC di lettura a mascherarli in base alle preferenze.

## Quando richiamarla

- dopo il caricamento iniziale del periodo visibile;
- dopo il salvataggio o la modifica di una giornata;
- dopo un'importazione;
- dopo la cancellazione, usando `deleteProjection(from, to)` e poi il nuovo upsert del periodo.

## Interfaccia

Montare `CalendarSharingView` in un contenitore dedicato della schermata Calendario. L'implementazione completa è in `src/app.mjs`.

## Regressione colori

La patch CSS cambia soltanto la pill superiore: la card resta invariata. Le pill usano il token `--<mode>-card-to`; testo e bordo sono adattati per contrasto. Non sostituire i gradienti della card con questi colori solidi.
