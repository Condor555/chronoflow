# Manifest patch Chrono Flow 3.3.5 — Pausa configurabile

**Baseline obbligatoria:** Chrono Flow 3.3.5 funzionante  
**Tipo:** patch incrementale da applicare sopra la 3.3.5  
**Versione applicativa conservata:** 3.3.5 (non viene rinominata 3.3.3)  
**Database:** nessuna nuova migration; nessuna modifica a `src/config.js`

## Correzioni funzionali

1. Il campo **Orario di inizio pausa** è ora realmente collocato in **Impostazioni → Giornata di lavoro** ed esiste una sola volta nel DOM.
2. Accetta `13`, `13:00`, `14` e, più in generale, ore valide da `0` a `23` con minuti opzionali; al blur/salvataggio normalizza in `HH:MM`.
3. Il valore continua a essere salvato in `family_settings.automatic_break_time`, con fallback compatibile `13:00` per i profili esistenti.
4. Timer netto, commesse percentuali, stato Home e blocco dell’azione pausa usano lo stesso orario configurato.
5. Se l’utente ha già premuto **Inizia pausa**, la pausa manuale sostituisce quella automatica e non viene sottratta una seconda pausa.
6. Se non è stata avviata manualmente, durante la finestra automatica il conteggio si arresta; al termine riprende e il pulsante resta realmente `disabled`.
7. Dopo una pausa manuale conclusa, il pulsante resta disabilitato per impedire una seconda pausa nella stessa giornata.
8. Lo stato disabilitato è anche visivamente oscurato e non riceve eventi di puntatore.
9. La cache PWA è aggiornata a `chrono-flow-v3.3.5-configurable-break-fix-1`, mantenendo entry point e versione 3.3.5.

## File runtime modificati

| File | Modifica |
|---|---|
| `index.html` | Sposta il campo pausa nelle Impostazioni; input flessibile, hint e policy; cache-busting CSS. |
| `styles.css` | Oscuramento forte e `pointer-events: none` sul pulsante pausa disabilitato. |
| `src/calculations.mjs` | Parser condiviso `normalizeBreakStartTime` e uso nel motore della finestra automatica. |
| `src/app.js` | Normalizzazione input, persistenza, protezione da doppia pausa, stato e disabilitazione Home. |
| `src/app.v3.3.5.mjs` | Cache-busting del modulo runtime senza cambiare versione. |
| `sw.js` | Forza il caricamento del worker hotfix 3.3.5. |
| `sw.v3.3.5.js` | Nuova cache e asset revisionati; elimina le cache precedenti all’attivazione. |

## Test modificati

- `tests/live-allocations-v3.3.5.test.mjs`
- `tests/e2e-integrated-v3.3.5.py`
- `tests/authoritative-shell-bootstrap.test.mjs`
- `tests/critical-regressions-v3.3.1.test.mjs`
- `tests/critical-regressions-v3.3.3.test.mjs`
- `tests/full-user-flows.test.mjs`
- `tests/projects-feature.test.mjs`
- `tests/settings-accordion.test.mjs`
- `tests/fixtures/settings-controls-3.2.0.json`

I test aggiornano i contratti della cache 3.3.5, l’inventario dei controlli delle Impostazioni e i nomi correnti delle API di pausa/allocazione. Non rimuovono copertura funzionale.

## Funzioni 3.3.5 preservate

La patch non modifica schema o RPC Supabase e non rimuove le correzioni 3.3.5 per commesse, percentuali dinamiche, ore/minuti manuali, viste Home/Calendario/Riepilogo o stati persistenti degli inviti calendario.
