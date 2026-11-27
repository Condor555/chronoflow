# Chrono Flow 3.3.0 · Gestione commesse

## Principio

La gestione commesse è un livello opzionale. La baseline 3.2.2 resta il comportamento predefinito: `projects_enabled` vale `false` e tutte le aree operative della feature sono nascoste con l’attributo `hidden`.

## Modello dati

- `work_projects`: anagrafica separata con codice, descrizione breve e stato attiva/archiviata.
- `work_allocations`: più righe per giornata; ogni riga collega una commessa, una data e una durata, con intervallo orario facoltativo.
- la giornata `work_days` non riceve alcun `project_id`;
- la commessa predefinita è una preferenza opzionale in `profiles.family_settings.default_project_id`;
- RLS e chiave composta `(project_id, user_id)` impediscono di collegare allocazioni a commesse di altri utenti.

## Esperienza utente

### Impostazioni

La sezione Commesse consente di:

- attivare/disattivare l’intera funzione;
- aggiungere codice e descrizione breve;
- archiviare e riattivare una commessa senza perdere lo storico;
- scegliere una commessa predefinita.

### Home

Dopo la card principale compare una funzione secondaria **Registra attività**. Il dialog propone la predefinita e le commesse recenti. L’utente può:

- indicare `Dalle` / `Alle`;
- inserire una durata;
- usare `+ 30 min` o `+ 1 ora`;
- registrare più commesse nella stessa giornata.

La barra confronta ore allocate e lavorate. La differenza genera soltanto un avviso: non impedisce timbrature o chiusura della giornata.

### Calendario

Nel dettaglio della giornata sono mostrate commesse, intervalli e durata. Ogni riga può essere modificata o eliminata. La cella mensile riceve un indicatore compatto solo quando la feature è attiva e ci sono ore allocate.

### Riepilogo

La sezione espandibile Commesse è fuori dai KPI principali e contiene:

- totale allocato del mese;
- ore per commessa;
- andamento dei dodici mesi dell’anno selezionato;
- accesso alle giornate del mese.

## Continuità e sicurezza

- cache locale e coda offline separate per commesse/allocazioni;
- backup JSON versione 3 quando la feature è attiva; import compatibile con i backup precedenti;
- archiviazione invece di cancellazione delle commesse;
- controllo client sulle sovrapposizioni degli intervalli;
- service worker versionato 3.3.0;
- `src/config.js` escluso dalla patch.
