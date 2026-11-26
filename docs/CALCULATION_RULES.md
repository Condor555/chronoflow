# Regole di calcolo consolidate

`orari_lavoro.xlsm` è la baseline autorevole di Chrono Flow 2.8.0. L’analisi ha censito 14 fogli e 12.906 celle con formula. I fogli operativi correnti sono `2026`, `Riepilogo_2026`, `2027` e `Riepilogo_2027`; i fogli storici restano una fonte di compatibilità.

## Classificazioni non intercambiabili

| Voce storica | Chrono Flow | Regola |
|---|---|---|
| `FESTIVO` | festività riconosciuta | Non è una festività soppressa e non consuma il plafond 4. |
| `FESTIVITÀ SOPP.` | `holiday` | Consuma esclusivamente il plafond festività soppresse. |
| `REC.RIPOSO` | `sunday_holiday_recovery` | Consuma il saldo delle festività riconosciute cadute di domenica. |
| `REC. MAGG. PRES.` | `recovery` | Recupero esplicito di maggiori prestazioni; non viene inferito da un’uscita anticipata. |
| `MALATTIA BAMBINO` | `child_sickness` + `child_id` | Il plafond appartiene al figlio e al relativo periodo. |

La migrazione conserva un marcatore testuale per `FESTIVO`, `REC.RIPOSO` e `REC. MAGG. PRES.`. Le righe storiche non collegabili restano visibili come “non collegato”; non vengono riclassificate in modo ambiguo.

## Giornata e pausa

Nel foglio `2026` la pausa predefinita è rappresentata da `H`/`I`: inizio alle 13:00, fine alle 13:30 in ufficio e alle 14:00 in Smart Working. L’uscita prevista è ingresso + pausa + 7:36. Chrono Flow replica il principio:

- senza eventi pausa applica la durata configurata per Ufficio, Smart o Trasferta;
- durante la giornata la pausa implicita entra nel contatore dalle 13:00;
- se esistono eventi `pause`/`resume`, la durata effettiva sostituisce integralmente quella predefinita;
- non vengono mai sommate pausa predefinita e pausa manuale.

## Buoni pasto

La regola giornaliera consolidata assegna `SI` a una presenza classificata e lo esclude per `FESTIVO`, ferie, recupero riposo, malattia, malattia bambino, congedi, sabato lavorativo e recupero maggiori prestazioni. Una rettifica esplicita prevale sulla regola automatica.

Il riepilogo distingue:

1. **maturati nel mese di attività**;
2. **competenza/accredito del mese**, riferita a due mesi prima;
3. **rettifiche** che riducono il conteggio automatico.

Per `Riepilogo_2026`, gennaio e febbraio non espongono la competenza; da marzo la base teorica segue letteralmente la formula del foglio 2026 (giorni teorici del mese di accredito meno esclusioni del mese −2). Dal foglio `Riepilogo_2027` la formula usa i giorni teorici del mese sorgente, anche quando ricade nell’anno precedente.

## Straordinario e recupero maggiori prestazioni

- **Straordinario lordo**: somma delle sole eccedenze positive oltre la giornata obiettivo e la soglia configurata.
- **Recupero maggiori prestazioni**: numero di giornate con causale esplicita `REC. MAGG. PRES.` × durata giornaliera (7:36 nella baseline).
- **Straordinario netto**: `MAX(0; lordo − recupero)`.

Una semplice uscita anticipata non crea automaticamente un recupero. Ogni data che contribuisce a lordo, recupero o netto è visibile nel registro di tracciabilità.

## Riepilogo mensile

Per ciascun mese sono calcolati separatamente:

- giorni lavorativi teorici lun–ven, escluse festività riconosciute;
- ferie;
- festività soppresse;
- recupero riposo festività;
- malattia;
- malattia bambino;
- congedo parentale facoltativo;
- maternità obbligatoria;
- paternità obbligatoria;
- paternità alternativa;
- congedo matrimoniale e causali storiche;
- giorni effettivi;
- Smart Working;
- sabati lavorativi;
- buoni maturati, accreditati e rettifiche;
- straordinario lordo, recupero maggiori prestazioni e netto.

## Massimali annuali e riporti

- Ferie: riporto precedente consumato prima della quota corrente; rettifica iniziale opzionale.
- Festività soppresse: solo causale `FESTIVITÀ SOPP.`, default 4.
- Recupero riposo festività: dipende dalla regola contrattuale configurata, distinta dalla disciplina generale. Nel 2026 il calendario riconosce domenica 4 ottobre (San Francesco d’Assisi) e domenica 1 novembre; con regola “matura 1 giorno” il massimale è 2.
- Malattia bambino: 30 giorni per figlio e anno di vita fino al terzo compleanno; dal giorno del terzo compleanno 10 giorni per figlio e anno solare fino a 14 anni.
- Paternità obbligatoria: evento separato, 10 giorni lavorativi o 20 per parto plurimo, dalla data presunta −2 mesi alla nascita/evento +5 mesi; il residuo scaduto resta nello storico.
- Maternità obbligatoria: evento separato e non annuale, modalità 2+3, 1+4 o 0+5; 1+4 e 0+5 richiedono le certificazioni previste.

Gli aggiornamenti normativi sono modellati in funzioni separate e non modificano retroattivamente formule o classificazioni storiche del file.
