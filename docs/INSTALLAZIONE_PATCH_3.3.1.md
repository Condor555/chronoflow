# Installazione patch Chrono Flow 3.3.1

## Baseline obbligatoria

Applicare questa patch **solo sopra Chrono Flow 3.3.0**. La migration Commesse 3.3.0 (`20261127_330_projects_allocations.sql`) deve essere già stata eseguita.

## Prima di iniziare

1. Creare un backup o un branch della 3.3.0.
2. Verificare di poter accedere al pannello SQL di Supabase.
3. Non modificare e non sostituire `src/config.js`.

## Ordine operativo

1. In Supabase eseguire una sola volta:
   `supabase/migrations/20261127_331_allocation_method.sql`
2. Estrarre lo ZIP della patch.
3. Caricare **il contenuto** della patch nella root della repository, mantenendo i percorsi.
4. Sovrascrivere i file omonimi.
5. Verificare che `src/config.js` sia rimasto invariato.
6. Attendere il deploy di GitHub Pages.
7. Chiudere tutte le schede e la PWA Chrono Flow, quindi riaprirla. Il service worker 3.3.1 elimina le cache precedenti.

## Perché la migration è necessaria

La colonna additiva `allocation_method` distingue una ripartizione automatica da ore inserite manualmente. Senza questa informazione Chrono Flow non potrebbe sapere, dopo un cambio dispositivo o una modifica degli orari, quali allocazioni debbano essere ricalcolate. La migration:

- non modifica `work_days`;
- non elimina dati;
- assegna alle allocazioni 3.3.0 esistenti il valore sicuro `hours`;
- accetta soltanto `automatic` o `hours`.

## Verifiche rapide dopo il deploy

1. **Persistenza modalità:** pianificare oggi come Smart nel Calendario, aprire Home, fare refresh e riaprire la PWA. Deve restare Smart.
2. **Calendario personale:** toccare una giornata e modificare modalità, ingresso, uscita e pausa. Il dettaglio deve salvare e riaprire gli stessi dati.
3. **Calendario condiviso:** aprire `Condivisi`. Non deve essere possibile modificare giornate.
4. **Commesse automatiche:** con una giornata completa, selezionare due commesse senza inserire ore. Devono ricevere 50% e 50% dell’orario lavorato.
5. **Commesse manuali:** selezionare `Ore manuali` e specificare le ore di ogni commessa.
6. **Commesse OFF:** disattivare la funzione nelle Impostazioni. Home, Calendario e Riepilogo non devono mostrare elementi relativi alle commesse.

## Rollback applicativo

Per tornare alla 3.3.0, ripristinare i file della 3.3.0. La nuova colonna può restare nel database: è additiva e la 3.3.0 la ignora. Non è necessario eseguire `DROP COLUMN`.
