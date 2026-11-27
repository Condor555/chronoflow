# Chrono Flow 3.2.1 — Home e Impostazioni

## Home

La Home mantiene struttura, tipografia, spaziature, metriche e navigazione del design system ripristinato, ma adotta la card estetica già approvata:

- superficie ampia;
- gradiente profondo specifico per modalità;
- decorazione circolare soft nell’angolo;
- testo bianco con contrasto AA su entrambi gli estremi del gradiente;
- pill modalità e microcopy integrate con superficie traslucida;
- azione primaria bianca ad alto contrasto.

Palette:

- Ufficio: `#24364e → #36566a`;
- Smart: `#1b334d → #356a6c`;
- Trasferta: `#342c50 → #665083`.

Quando lo straordinario Smart è disattivato, la card mostra `Uscita automatica alle HH:MM` e non mostra `Registra uscita`. Calcolo, chiusura automatica e ricalcolo non sono stati modificati dalla revisione estetica.

## Impostazioni

### Macro-sezioni

1. **Giornata di lavoro** — durata, pause e nome visualizzato.
2. **Modalità e straordinari** — Ufficio, Smart, Trasferta, sabato, soglia e abilitazioni.
3. **Buoni pasto** — regole automatiche per modalità.
4. **Ferie, festività e recuperi** — spettanze, riporto automatico, festività soppresse e recuperi.
5. **Famiglia e congedi** — profilo genitoriale, figli, malattia bambino, maternità/paternità e parentale.
6. **Notifiche** — uscita prevista e permessi dispositivo.
7. **Condivisione calendario** — inviti, accessi, revoca e privacy.
8. **Account e dati** — password, backup, importazione e dati locali.

### Accordion single-open

- una sola macro-sezione può essere aperta;
- aprendo una card, ogni altra macro aperta si chiude;
- le sottosezioni Avanzate possono essere aperte solo dentro la macro corrente;
- `aria-expanded` e `aria-controls` restano sincronizzati;
- dopo l’apertura utente, il summary riceve focus e viene portato in vista rispettando `prefers-reduced-motion`;
- un controllo invalido apre automaticamente la macro corretta prima di ricevere focus;
- la sezione aperta non viene chiusa dopo il salvataggio.

### Progressive disclosure

Sono state trasformate in sottosezioni Avanzate, senza eliminazione:

- causali e assenze facoltative;
- preferenze di presentazione del Riepilogo;
- recuperi e festività locali;
- sicurezza/password;
- backup, importazione e dati locali.

I 52 controlli input/select/textarea presenti prima del refactor sono verificati uno per uno da un fixture contract. La separazione configurazione → motore → presentazione resta invariata: le preferenze continuano a filtrare Home, Calendario e Riepilogo senza cancellare lo storico.

## Validazione Condivisione

Il salvataggio generale delle Impostazioni e l’invio di un invito sono due flussi indipendenti. Il campo email viene validato soltanto quando si preme **Invita** e usa validazione inline:

- niente tooltip browser bloccante;
- messaggio con `role="alert"`;
- `aria-invalid="true"` sul campo errato;
- focus sul campo;
- errore rimosso durante la correzione.

Lo stato del toggle è esplicito:

- ON: **Condivisione attiva**; inviti, permessi, accessi e revoche sono disponibili;
- OFF: **Condivisione non attiva**; inviti e permessi sono nascosti e disabilitati;
- disattivare la condivisione sospende gli accessi, ma non elimina storico, membri o inviti già registrati.

## Verifiche

- 164 test automatici, 0 errori;
- contratto di conservazione per 52 controlli;
- test single-open, focus, scroll e ARIA;
- render reali a 390 × 844 e 1440 × 1000;
- nessun overflow orizzontale;
- screenshot Home standard/Smart automatica, Impostazioni mobile/desktop, validazione Condivisione e stato Condivisione OFF.
