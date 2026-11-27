# Chrono Flow 3.2.2 — HOTFIX Home + Accordion

## Baseline

Patch incrementale da applicare a **Chrono Flow 3.2.1** (`chrono-flow-v3.2.1-HOME-SETTINGS-PATCH-from-3.2.0-final.zip`).

SHA-256 baseline verificata: `6c496a0cae808a36ae19ea1d77706644cea074a767d9d6cae302cc0253b3135d`.

## Risultato

- **Impostazioni:** le otto macro-card condividono il gruppo nativo `name="chrono-settings"`; aprire una card chiude realmente quella già aperta. Il codice applicativo mantiene anche un fallback deterministico, sincronizza `aria-expanded` e conserva focus/scroll da tastiera e mobile.
- **Home:** ripristinati gradiente profondo, profondità cromatica, anello circolare soft, palette distinta Ufficio/Casa/Trasferta e pill a gradiente coerente ma non piatta.
- **Cache/PWA:** nuova entry immutabile e nuovo service worker 3.2.2. Le entry 3.2.1 restano come compatibilità e inoltrano alla build nuova, evitando che browser o PWA continuino a mostrare CSS/JS 3.2.1 in cache.
- **Funzioni preservate:** nessuna modifica a timer, uscita automatica Smart Working, condivisione calendario, salvataggio, calcoli, dati o schema.

## File MODIFICATI rispetto alla 3.2.1

- `index.html`
- `package.json`
- `styles.css`
- `sw.js`
- `sw.v3.2.1.js`
- `src/app.js`
- `src/app.v3.2.1.mjs`
- `src/stale-shell-recovery.v3.2.1.mjs`
- `tests/home-theme.test.mjs`
- `tests/settings-accordion.test.mjs`

## File NUOVI

- `sw.v3.2.2.js`
- `src/app.v3.2.2.mjs`
- `tests/verify_hotfix_3_2_2.py`
- `tests/render-output-3.2.2/home-card-mobile-390.png`
- `tests/render-output-3.2.2/home-card-desktop-1440.png`
- `tests/render-output-3.2.2/verification-report.json`
- `PATCH_MANIFEST.md`
- `SHA256SUMS`

## Verifiche eseguite

- Controllo sintattico di `src/app.js`, `src/app.v3.2.2.mjs` e `sw.v3.2.2.js`.
- **15/15 test statici** Home + Impostazioni superati.
- Test Chromium DOM/interazione: stato iniziale + apertura sequenziale di tutte le **8 macro-card**; dopo ogni click è rimasto aperto esattamente un solo elemento.
- Test tastiera con `Enter`: superato.
- Render verificati a **390 × 844** e **1440 × 1000**, senza overflow orizzontale.
- Gradienti calcolati distinti per Ufficio, Casa/Smart e Trasferta; decorazione `::after` presente.
- Contrasto testo bianco sui due estremi di ogni gradiente:
  - Ufficio: **12,26:1 / 7,79:1**
  - Casa/Smart: **12,90:1 / 6,12:1**
  - Trasferta: **12,95:1 / 6,91:1**
  Tutti superiori a WCAG AA 4,5:1.

## Applicazione

1. Esegui un backup della repository 3.2.1.
2. Estrai lo ZIP.
3. Carica **il contenuto** nella root della repository mantenendo i percorsi e sovrascrivendo i file omonimi.
4. Non modificare `src/config.js`.
5. Non eseguire SQL o migration.
6. Attendi il deploy; chiudi tutte le schede/PWA Chrono Flow e riapri l’app. La build 3.2.2 elimina automaticamente le cache precedenti.

## Esclusioni garantite

La patch non contiene `src/config.js`, file SQL, migration, policy RLS, esportazioni o dati utente.
