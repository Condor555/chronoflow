# Sicurezza e privacy

## Confini di accesso

- Nessuna API di condivisione è eseguibile dal ruolo `anon`.
- Tutte le funzioni usano `auth.uid()` e un `search_path` fissato.
- I viewer non hanno accesso diretto alla proiezione privata.
- Il destinatario di un invito deve autenticarsi con la stessa email indicata nell'invito.
- Disattivazione globale e revoca hanno effetto al successivo accesso; non cancellano lo storico del proprietario.
- Le funzioni limitano la lettura e la sincronizzazione a 400 giorni per richiesta.

## Dati sensibili

I dati su assenze dettagliate, note e figli sono disattivati per default. Attivarli può rivelare informazioni sanitarie o familiari. Chrono Flow mostra queste opzioni come sensibili e non le abilita automaticamente.

## Chiavi

Nel browser usare esclusivamente la Publishable/Anon Key. Non inserire mai Service Role Key, password del database o token amministrativi in `src/config.js`.

## Revoca

La revoca imposta la membership a `revoked`. La disattivazione dello spazio sospende contemporaneamente tutti i viewer. In entrambi i casi `cf_get_shared_calendar` interrompe la lettura.

## Segnalazioni

Non inserire dati personali reali in issue pubbliche. Per una segnalazione allegare solo passi di riproduzione e dati fittizi.
