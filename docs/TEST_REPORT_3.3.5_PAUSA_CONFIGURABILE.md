# Test report — Chrono Flow 3.3.5 Pausa configurabile

Data: 27 novembre 2026  
Baseline: Chrono Flow 3.3.5

## Gate finali

| Comando | Esito |
|---|---:|
| `npm run check` | 36/36 superati |
| `npm test` | 220/220 superati |
| `npm run test:e2e` | 3/3 scenari Chromium superati |

## Verifiche specifiche

- parser: `13` → `13:00`, `13:00` → `13:00`, `14` → `14:00`, `9` → `09:00`, `9:30` → `09:30`;
- valori non validi (`24`, `13:60`) rifiutati dal campo e ricondotti al fallback solo nel livello difensivo del dominio;
- unico controllo `automatic-break-time`, presente nelle Impostazioni e non nella Home;
- salvataggio e riapertura E2E di `14` come `14:00`;
- fallback `13:00` per profili senza preferenza;
- arresto del timer netto e delle allocazioni percentuali nella finestra configurata `12:45–13:15`;
- ripresa dopo la finestra e pulsante pausa ancora disabilitato;
- pausa manuale senza doppia sottrazione automatica;
- pulsante realmente `disabled`, con oscuramento CSS e nessun evento di puntatore;
- cache PWA aggiornata e asset runtime inclusi;
- flussi 3.3.5 di commesse, durata manuale `1:15`, Home/Calendario/Riepilogo e stati inviti ancora coperti dagli scenari integrati.

## Nota sul browser test

Gli scenari E2E eseguono il DOM reale di `index.html` con Chromium headless e un backend Supabase deterministico simulato. Non sono necessarie credenziali nel pacchetto. Dopo il deploy resta consigliato il normale smoke test sul progetto Supabase reale.
