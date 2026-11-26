# PATCH manifest — Chrono Flow 2.9.4 → 3.0.0

Il pacchetto PATCH contiene soltanto file nuovi o modificati. I percorsi sono relativi alla root della repository.

## File modificati (9)

| Percorso | Motivo |
|---|---|
| `CHANGELOG.md` | Release Condivisione Calendario e correzione palette pill. |
| `README.md` | Architettura, installazione e test. |
| `SECURITY.md` | Confini RLS e dati sensibili. |
| `SHA256SUMS` | Integrità dei file consegnati. |
| `index.html` | Accesso alle viste Home/Calendario e bootstrap moduli. |
| `package.json` | Comandi di test/check. |
| `styles.css` | UI calendario mobile-first e pill ricondotte alla palette delle card. Le card mantengono gradienti/decorazioni. |
| `sw.js` | Cache 3.0.0 e nuovi moduli. |
| `src/app.mjs` | Montaggio vista calendario, sessione autenticata e navigazione. |

## File nuovi (13)

| Percorso | Scopo |
|---|---|
| `PATCH_MANIFEST.md` | Questo inventario. |
| `docs/INSTALLAZIONE_BROWSER.md` | Procedura GitHub/Supabase e collaudo. |
| `docs/INTEGRAZIONE_BASELINE_2.9.4.md` | Hook di sincronizzazione non distruttivo. |
| `src/calendar-date.mjs` | Intervalli mese/settimana. |
| `src/calendar-privacy.mjs` | Default privacy e sanitizzazione. |
| `src/calendar-sharing.mjs` | Client RPC, inviti, revoche e proiezione. |
| `src/calendar-sharing-view.mjs` | UI Il mio/Condivisi/Confronta/Privacy. |
| `src/supabase-client.mjs` | Client autenticato riutilizzabile. |
| `supabase/migrations/20261126_001_calendar_sharing.sql` | Tabelle, indici, RLS e RPC. |
| `tests/calendar-sharing.test.mjs` | Privacy, date e adapter 2.9.4. |
| `tests/security-contract.test.mjs` | Contratto RLS e masking. |
| `tests/home-theme.test.mjs` | Contratto palette pill/card. |
| `tests/home-theme.browser.html` | Test DOM/computed-style reale e contrasto WCAG. |

## File invariati ed esclusi

- `src/config.js`: escluso per non sovrascrivere URL e chiave Supabase.
- `src/home-display.mjs`: escluso; nessuna modifica alle logiche timer/modalità.
- `manifest.webmanifest`, `LICENSE` e ogni altro file 2.9.4: esclusi.

## Correzione cromatica finale

La richiesta più recente annulla il precedente allineamento “card uguale alla pill”. La card è la sorgente di verità e resta visivamente invariata. Per ogni modalità la pill usa il token finale della stessa palette (`--office-card-to`, `--smart-card-to`, `--travel-card-to`) con foreground e bordo accessibili. I test verificano il valore computed-style della pill, il contrasto WCAG AA, la sincronizzazione DOM e la permanenza del gradiente della card.

## Ordine di applicazione

1. Caricare i file della PATCH su GitHub mantenendo questi percorsi.
2. Conservare il `src/config.js` già configurato.
3. Eseguire in Supabase il file SQL della migrazione.
4. Attendere GitHub Pages e riaprire la PWA.
5. Eseguire il collaudo con due account descritto in `docs/INSTALLAZIONE_BROWSER.md`.
