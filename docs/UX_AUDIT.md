# Audit UI/UX e specifica applicata — Chrono Flow 2.9.0

## Executive Summary

La revisione adotta il principio **“potenza sotto, semplicità sopra”**. Il motore conserva tutte le causali, i saldi e lo storico; l’interfaccia ordinaria mostra invece soltanto ciò che è applicabile, configurato, usato o ancora rilevante per saldo e scadenza.

I principali problemi rilevati erano: KPI duplicati, termini tecnici esposti come informazioni primarie, congedi non pertinenti al profilo, periodi scaduti mostrati insieme a quello corrente e Impostazioni non ancora usate come sorgente unica della personalizzazione. La 2.9.0 interviene su questi punti senza migrazioni distruttive.

## Audit di usabilità, navigazione e flussi

### Problemi

- Il Riepilogo richiedeva di interpretare troppe card prima di capire lo stato corrente.
- Straordinario lordo e netto erano separati, pur appartenendo allo stesso saldo.
- Le rettifiche dei buoni pasto occupavano lo stesso livello dei valori utili.
- Maternità e paternità potevano comparire contemporaneamente senza essere applicabili.
- Le causali importate e non classificate generavano rumore anche a valore zero.
- Per Malattia bambino potevano comparire più anni di vita contemporaneamente.

### Soluzione applicata

- Navigazione del Riepilogo ridotta a **Mese, Saldi, Dettagli**.
- Livello primario limitato a ore lavorate, straordinario residuo e buoni pasto.
- Dettagli verificabili tramite disclosure espandibili.
- Impostazioni trasformate nella sorgente di applicabilità per Home, Calendario e Riepilogo.
- Storico e dati da classificare mostrati solo quando contengono valori reali.

## Analisi UI, layout e gerarchia

- Le informazioni di stato corrente precedono saldi e storico.
- Straordinario usa una sola area con maturato, recuperato/compensato e residuo.
- Buoni pasto usa un solo KPI; competenza, rettifiche e date sono secondarie.
- Le card chiuse espongono un riepilogo sintetico dello stato.
- Le griglie passano a una colonna sugli schermi stretti.
- Componenti, bordi, spaziature, disclosure e CTA riusano il design system esistente.

## Accessibilità e best practice mobile

- Target interattivi minimi di 44 px.
- Focus visibile su pulsanti, input, link e summary.
- Gerarchia semantica con heading, `details/summary`, `dl` per metriche e label associate ai controlli.
- Stato delle disclosure sincronizzato con `aria-expanded` e `aria-controls`.
- Layout utilizzabile da 320 px, senza dipendere dal colore per comunicare lo stato.
- Rispetto di `prefers-reduced-motion`.
- Microcopy breve, orientata all’azione e priva di gergo di riconciliazione nel livello principale.

## Redesign delle schermate critiche

### Riepilogo

1. KPI principali: ore lavorate, straordinario, buoni pasto.
2. Distribuzione delle giornate opzionale.
3. Saldi annuali di ferie e recuperi.
4. Dettagli espandibili di straordinario e buoni pasto.
5. Causali e plafond filtrati per configurazione o utilizzo reale.
6. Storico/dati da classificare visibile solo quando necessario.

### Impostazioni

- Profilo lavorativo.
- Modalità di lavoro.
- Ferie e recuperi.
- Buoni pasto.
- Altre assenze e congedi.
- Famiglia e genitorialità con profilo Padre, Madre o Personalizzato e istituti per figlio/evento.
- Preferenze Riepilogo.
- Notifiche, sicurezza e dati.

### Malattia bambino

- Una sola voce per il periodo attivo.
- Cambio di periodo esattamente al compleanno.
- Passaggio alla fascia 3–14 dal terzo compleanno.
- Periodi conclusi nello storico secondario.
- Riconciliazione virtuale e non distruttiva delle giornate importate non collegate quando esiste un solo figlio compatibile.

## Matrice di priorità

| Priorità | Intervento | Esito 2.9.0 |
|---|---|---|
| P0 | Correggere periodo attivo e riconciliazione Malattia bambino | Completato |
| P0 | Evitare perdita o modifica dei dati storici | Completato |
| P0 | Rimuovere KPI tecnici e duplicati dal livello principale | Completato |
| P1 | Centralizzare applicabilità nelle Impostazioni | Completato |
| P1 | Filtrare maternità/paternità per profilo e figlio | Completato |
| P1 | Accorpare straordinario e buoni pasto con dettaglio su espansione | Completato |
| P1 | Rendere visibili le causali solo se attivate, usate o ancora rilevanti | Completato |
| P2 | Preferenze per distribuzione e storico annuale | Completato |
| P2 | Ulteriori test manuali su dati reali dopo il deploy | Da eseguire sul dispositivo dell’utente |

## Piano d’azione e verifica

1. Eseguire i test automatici e i controlli statici.
2. Verificare da smartphone il profilo genitoriale e l’attivazione per figlio.
3. Controllare che i 7 giorni storici di Elena confluiscano nel periodo compatibile senza aggiornare le righe salvate.
4. Verificare il passaggio di periodo al compleanno con date di test.
5. Confrontare i totali di straordinario e buoni pasto prima/dopo l’aggiornamento.
6. Controllare focus, lettura tramite screen reader e touch target sulle disclosure.
