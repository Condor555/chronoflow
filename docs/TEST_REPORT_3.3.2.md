# Rapporto test Chrono Flow 3.3.2

## Esito

- Controllo sintattico: superato.
- Suite Node completa: **192/192 test superati**.
- Suite mirata `npm run check`: **27/27 test superati**.
- Test end-to-end Chromium mobile 390×844: superato, **0 errori pagina**.

## Flusso end-to-end verificato

Il test parte da una giornata odierna salvata con:

- `planned_type = smart`;
- vecchio `actual_type = office`;
- nessuna attività registrata;
- Commesse attive.

Verifiche effettuate:

1. la Home mostra Smart Working;
2. dopo reload/riapertura continua a mostrare Smart Working;
3. il tap sulla giornata odierna apre il dettaglio editabile;
4. la sezione Commesse è visibile;
5. vengono salvati Trasferta, ingresso 08:00, pausa 12:00–13:00, uscita 17:00 e note;
6. il backend simulato conserva una sola riga `work_days` per la data;
7. la Home si aggiorna a Trasferta;
8. gli eventi persistiti sono `entry`, `pause`, `resume`, `exit`;
9. nessun errore JavaScript viene generato.

Il test è ripetibile con:

```bash
python3 tests/e2e-home-calendar.py
```
