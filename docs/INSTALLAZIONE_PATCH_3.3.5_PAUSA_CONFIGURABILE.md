# Installazione — patch pausa configurabile per Chrono Flow 3.3.5

## Prerequisito

Questa patch va applicata **sopra Chrono Flow 3.3.5 funzionante**. Non è una build 3.3.3 e non sostituisce la migration già prevista dalla 3.3.5.

## Procedura

1. Esegui un backup della repository 3.3.5.
2. Estrai lo ZIP.
3. Copia **il contenuto** della cartella `CHRONO_FLOW_PATCH_3.3.5_PAUSA_CONFIGURABILE` nella root della repository.
4. Mantieni i percorsi e sovrascrivi i file omonimi.
5. Non eliminare entry point, worker o migration precedenti.
6. Non modificare `src/config.js`.
7. Non eseguire nuove query SQL: questa patch non contiene migration.
8. Pubblica normalmente la repository.
9. Dopo il deploy, chiudi completamente browser/PWA e riapri Chrono Flow. Il worker attiverà la cache `chrono-flow-v3.3.5-configurable-break-fix-1`.

## Verifica rapida

1. Apri **Impostazioni → Giornata di lavoro**.
2. Inserisci `14` in **Orario di inizio pausa**: il campo deve diventare `14:00` e restare tale dopo il salvataggio e la riapertura.
3. Con pausa da 30 minuti e giornata avviata, tra `14:00` e `14:30` il timer e le commesse percentuali devono fermarsi.
4. Alle `14:30` il conteggio deve riprendere; **Inizia pausa** deve essere oscurato, `disabled` e non cliccabile.
5. In una giornata separata, premi **Inizia pausa** prima delle `14:00`: la pausa automatica non deve essere applicata in aggiunta e non deve essere possibile avviare una seconda pausa.
