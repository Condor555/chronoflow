# Audit finale UI — Chrono Flow 3.2.0

## Decisione architetturale

- **Frontend:** la 2.9.4 è la sorgente di verità per shell, DOM, CSS, componenti, navigazione e responsive design.
- **Motore funzionale:** rimane quello cumulativo più recente, incluse le funzioni 2.9.x e 3.x.
- **Database:** migration e RLS calendario 3.0.0 restano indipendenti dalla shell grafica e non vengono modificate.

La regressione osservata — header `Oggi / Calendario / Esci`, Home minimale e Calendario spoglio — coincide esattamente con `index.html` + `app.v3.0.5.mjs` della hotfix 3.0.5. Non c’è evidenza che la migration Supabase abbia causato la regressione grafica.

## Causa frontend corretta

La build corrente conteneva già i file 2.9.4 ripristinati, ma manteneva anche gli entry point e service worker della shell minimale 3.0.x. Un dispositivo che continuava a caricare `app.v3.0.5.mjs` montava ancora la UI fallback, indipendentemente dai nuovi componenti presenti nella repository.

La 3.2.0 rende il percorso univoco:

1. `index.html` completo 2.9.4 carica `src/app.v3.2.0.mjs`;
2. `src/app.v3.2.0.mjs` carica il motore completo `src/app.js?v=3.2.0`;
3. `src/app.v3.0.5.mjs` e `src/app.mjs` non montano più la shell minimale: eseguono una navigazione cache-busted verso l’indice autorevole;
4. `sw.js`, `sw.v3.0.5.js` e `sw.v3.1.0.js` delegano tutti a `sw.v3.2.0.js`;
5. il worker 3.2 usa network-first per navigazioni e codice, attende `preloadResponse` e rimuove le cache precedenti.

## Parità grafica 2.9.4

Il confronto DOM/CSS conferma che:

- il CSS della build finale contiene il CSS 2.9.4 byte-per-byte come prefisso autorevole;
- le regole aggiuntive sono limitate ai componenti post-2.9.4;
- la Home, quando non mostra estensioni post-2.9.4, produce screenshot pixel-identici alla 2.9.4 sia a 390 px sia a 1440 px;
- non esiste overflow orizzontale nei render di Oggi, Calendario personale, Condivisi, Riepilogo e Impostazioni;
- sono presenti quattro destinazioni di navigazione e Profilo/account.

## Integrazioni native

### Calendario

- **Il mio** è la vista predefinita e conserva il calendario 2.9.4, pianificazione multipla e modifica giornata.
- **Condivisi** usa lo stesso layout e design system.
- Dentro Condivisi sono disponibili selezione persona, vista mensile e **Confronta** settimanale mobile-first.
- Non esiste più il pulsante flottante di condivisione.

### Impostazioni

`Condivisione calendario` è una card `settings-disclosure` nativa. Quando viene aperta mostra direttamente:

- attivazione/sospensione;
- invito;
- accessi attivi e revoca;
- inviti inviati;
- preferenze privacy.

### Home Smart

Con straordinario Smart disattivato:

- la card mostra `Uscita automatica alle HH:MM`;
- `Registra uscita` è nascosto;
- durata e pausa standard/effettiva determinano l’uscita;
- il ricalcolo conserva gli eventi automatici precedenti come storico superseded.

### Storico e genitorialità

- `Dati da sistemare` resta nel Riepilogo come disclosure temporanea con dialog di riclassificazione e undo.
- Famiglia, figli, malattia bambino, maternità, paternità e congedi restano nelle card progressive disclosure della 2.9.4.

## Database

La migration `20261126_001_calendar_sharing.sql` è stata verificata staticamente:

- crea soltanto tabelle `cf_calendar_*` con `IF NOT EXISTS`;
- non esegue `DROP TABLE` o `TRUNCATE`;
- non altera, aggiorna o cancella righe di `work_days` o `profiles`;
- policy, trigger e funzioni riguardano esclusivamente `cf_calendar_*`;
- le modifiche applicative riguardano la proiezione condivisa, non i dati personali sorgente.

È quindi trattata come additiva e resta invariata nella patch.

## Verifiche

- 155 test automatici superati, 0 errori.
- Render Playwright a 390 × 844 e 1440 × 1000.
- Differenza pixel Home standard rispetto alla 2.9.4: `0.0` mobile e desktop.
- Render dedicati per Home Smart automatica, Calendario personale, Calendario condiviso, Riepilogo e Impostazioni/condivisione.
