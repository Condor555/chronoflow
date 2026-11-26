import test from "node:test";
import assert from "node:assert/strict";

process.env.TZ = "Europe/Rome";
import {
  calculateDay,
  calculateDayWithBreakPolicy,
  calculateDayWithPolicies,
  calculateDayWithOvertimePolicy,
  annualLeaveBalance,
  childSicknessEntitlement,
  childSicknessPeriodsForYear,
  reconcileChildSicknessDays,
  canUseSundayHolidayRecovery,
  easterSunday,
  eventsFromLocalTimes,
  exitNotificationTime,
  forecastExit,
  formatTime,
  holidayRecoveryBalance,
  isSuppressedHolidayDay,
  isWorkingSaturday,
  minutesToDuration,
  maternityMandatoryEntitlement,
  overtimeEnabledForType,
  parentalLeaveLimits,
  paternityMandatoryEntitlement,
  recognizedItalianHolidays,
  secondsToDuration,
  sundayHolidays,
  SUNDAY_HOLIDAY_RULES,
  theoreticalWorkdays,
  ticketForDay,
  validateParentalLeaveQuota,
  workbookMonthlySummary
} from "../src/calculations.mjs";

const at = (time) => `2026-11-26T${time}:00+01:00`;

test("calcola 7:36 di lavoro con pausa di 30 minuti", () => {
  const events = [
    { type: "entry", at: at("08:35") },
    { type: "pause", at: at("12:30") },
    { type: "resume", at: at("13:00") },
    { type: "exit", at: at("16:41") }
  ];
  const result = calculateDay(events, 456, 10, new Date(at("16:41")));
  assert.equal(result.workedMinutes, 456);
  assert.equal(result.pausedMinutes, 30);
  assert.equal(result.overtimeMinutes, 0);
  assert.equal(result.state, "finished");
});

test("espone il contatore al secondo per l’aggiornamento live della home", () => {
  const result = calculateDay(
    [{ type: "entry", at: "2026-11-26T08:00:00+01:00" }],
    456,
    10,
    new Date("2026-11-26T08:04:07+01:00")
  );
  assert.equal(result.workedSeconds, 247);
  assert.equal(result.remainingSeconds, 27113);
  assert.equal(secondsToDuration(result.workedSeconds), "0:04:07");
});

test("prevede uscita alle 16:41 da ingresso 08:35", () => {
  const exit = forecastExit([{ type: "entry", at: at("08:35") }], 456, 30, new Date(at("09:00")));
  assert.equal(formatTime(exit), "16:41");
});

test("applica la soglia allo straordinario", () => {
  const events = [
    { type: "entry", at: at("08:00") },
    { type: "exit", at: at("15:45") }
  ];
  assert.equal(calculateDay(events, 456, 10, new Date(at("15:45"))).overtimeMinutes, 0);
  assert.equal(calculateDay(events, 456, 5, new Date(at("15:45"))).overtimeMinutes, 9);
});

test("straordinario Smart Working e trasferta disattivato di default", () => {
  assert.equal(overtimeEnabledForType("office", {}), true);
  assert.equal(overtimeEnabledForType("smart", {}), false);
  assert.equal(overtimeEnabledForType("travel", {}), false);
});

test("straordinario Smart Working e trasferta può essere abilitato separatamente", () => {
  assert.equal(overtimeEnabledForType("smart", { smart: true, travel: false }), true);
  assert.equal(overtimeEnabledForType("travel", { smart: true, travel: false }), false);
  assert.equal(overtimeEnabledForType("travel", { smart: false, travel: true }), true);
});

test("la policy azzera lo straordinario senza modificare le ore lavorate", () => {
  const events = [
    { type: "entry", at: at("08:00") },
    { type: "exit", at: at("16:00") }
  ];
  const disabled = calculateDayWithOvertimePolicy(events, 456, 10, "smart", {}, new Date(at("16:00")));
  const enabled = calculateDayWithOvertimePolicy(events, 456, 10, "smart", { smart: true }, new Date(at("16:00")));
  assert.equal(disabled.workedMinutes, 480);
  assert.equal(disabled.overtimeMinutes, 0);
  assert.equal(enabled.overtimeMinutes, 24);
});

test("formatta durate superiori a 24 ore", () => {
  assert.equal(minutesToDuration(1565), "26:05");
});

test("riepilogo annuale separa ferie precedenti, correnti e residue", () => {
  const days = [
    ...Array.from({ length: 16 }, (_, index) => ({
      work_date: `2025-07-${String(index + 1).padStart(2, "0")}`,
      actual_type: "absence",
      absence_type: "vacation"
    })),
    ...Array.from({ length: 21 }, (_, index) => ({
      work_date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      actual_type: "absence",
      absence_type: "vacation"
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      work_date: `2026-01-${String(index + 7).padStart(2, "0")}`,
      planned_type: "absence",
      actual_type: null,
      absence_type: "holiday"
    }))
  ];
  const result = annualLeaveBalance({ year: 2026, days });
  assert.deepEqual(result.vacation.previous, { used: 4, total: 4 });
  assert.deepEqual(result.vacation.current, { used: 17, total: 20 });
  assert.equal(result.vacation.used, 21);
  assert.equal(result.vacation.total, 24);
  assert.equal(result.vacation.remaining, 3);
  assert.deepEqual(result.suppressedHolidays, { used: 4, total: 4, remaining: 0, exceeded: 0 });
});

test("il riporto può essere rettificato senza perdere il massimale annuale", () => {
  const result = annualLeaveBalance({
    year: 2026,
    days: Array.from({ length: 21 }, (_, index) => ({
      work_date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      planned_type: "absence",
      absence_type: "vacation"
    })),
    settings: {
      default_vacation_days: 20,
      default_suppressed_holiday_days: 4,
      years: { "2026": { vacation_days: 20, suppressed_holiday_days: 4, carryover_override: 4 } }
    }
  });
  assert.equal(result.carryoverSource, "override");
  assert.equal(result.vacation.total, 24);
  assert.equal(result.vacation.remaining, 3);
});

test("l'anno successivo eredita automaticamente il residuo calcolato", () => {
  const result = annualLeaveBalance({
    year: 2027,
    days: Array.from({ length: 21 }, (_, index) => ({
      work_date: `2026-10-${String(index + 1).padStart(2, "0")}`,
      actual_type: "absence",
      absence_type: "vacation"
    })),
    settings: {
      default_vacation_days: 20,
      default_suppressed_holiday_days: 4,
      years: { "2026": { vacation_days: 20, suppressed_holiday_days: 4, carryover_override: 4 } }
    }
  });
  assert.equal(result.carryoverSource, "automatic");
  assert.equal(result.vacation.previous.total, 3);
  assert.equal(result.vacation.total, 23);
});

test("ticket: override e regole profilo", () => {
  const profile = { ticket_office: true, ticket_smart: false, ticket_travel: true };
  assert.equal(ticketForDay(profile, { actual_type: "office", ticket_override: null }), true);
  assert.equal(ticketForDay(profile, { actual_type: "smart", ticket_override: null }), false);
  assert.equal(ticketForDay(profile, { actual_type: null, planned_type: "travel", ticket_override: null }), true);
  assert.equal(ticketForDay(profile, { actual_type: "smart", ticket_override: true }), true);
  assert.equal(ticketForDay(profile, { actual_type: "absence", ticket_override: true }), false);
});

test("malattia bambino: i 30 giorni seguono l'anno di vita, non l'anno solare", () => {
  const child = { birth_date: "2024-06-10" };
  const firstLifeYear = childSicknessEntitlement(child, "2025-01-15", 4, 2);
  assert.equal(firstLifeYear.tier, "under_three");
  assert.equal(firstLifeYear.lifeYear, 1);
  assert.equal(firstLifeYear.periodEnd, "2025-06-09");
  assert.equal(firstLifeYear.remainingPaidDays, 24);

  const secondLifeYear = childSicknessEntitlement(child, "2025-06-10", 1, 0);
  assert.equal(secondLifeYear.lifeYear, 2);
  assert.equal(secondLifeYear.periodStart, "2025-06-10");
  assert.equal(secondLifeYear.remainingPaidDays, 29);
});

test("malattia bambino: dai 3 ai 14 anni applica 10 giorni per anno solare", () => {
  const result = childSicknessEntitlement({ birth_date: "2020-04-03" }, "2026-11-26", 3, 2);
  assert.equal(result.tier, "three_to_fourteen");
  assert.equal(result.periodStart, "2026-01-01");
  assert.equal(result.remainingDays, 5);
});

test("ricostruisce gli orari modificati dal calendario", () => {
  let id = 0;
  const events = eventsFromLocalTimes("2026-11-20", {
    entry: "08:30",
    pauseStart: "13:00",
    pauseEnd: "13:30",
    exit: "16:36"
  }, () => `id-${++id}`);
  assert.deepEqual(events.map((event) => event.type), ["entry", "pause", "resume", "exit"]);
  assert.equal(calculateDay(events, 456, 10, new Date(events.at(-1).at)).workedMinutes, 456);
});

test("calcola l'istante di notifica prima dell'uscita", () => {
  const notification = exitNotificationTime(new Date("2026-11-26T17:00:00+01:00"), 10);
  assert.equal(notification.toISOString(), "2026-11-26T15:50:00.000Z");
});

test("festività: calcola Pasqua e Lunedì dell’Angelo 2026", () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), "2026-04-05");
  assert.ok(recognizedItalianHolidays(2026).some((item) => item.date === "2026-04-06"));
});

test("festività: rileva San Francesco e Ognissanti come domeniche nel 2026", () => {
  assert.deepEqual(sundayHolidays(2026).map((item) => item.date), ["2026-10-04", "2026-11-01"]);
});

test("festività: non duplica il credito se la festa locale coincide con quella nazionale", () => {
  const holidays = recognizedItalianHolidays(2026, { name: "Festa locale", month: 11, day: 1 });
  assert.equal(holidays.filter((item) => item.date === "2026-11-01").length, 1);
});

test("recuperi: matura soltanto quando la festività domenicale è trascorsa", () => {
  const before = holidayRecoveryBalance({ year: 2026, rule: SUNDAY_HOLIDAY_RULES.ACCRUE_DAY, asOf: "2026-10-31" });
  const after = holidayRecoveryBalance({ year: 2026, rule: SUNDAY_HOLIDAY_RULES.ACCRUE_DAY, asOf: "2026-11-01" });
  assert.equal(before.automaticAccrued, 1);
  assert.equal(after.automaticAccrued, 2);
});

test("recuperi: utilizzati e correzione aggiornano il disponibile", () => {
  const balance = holidayRecoveryBalance({
    year: 2027,
    rule: SUNDAY_HOLIDAY_RULES.ACCRUE_DAY,
    usedDates: ["2027-05-02", "2027-05-02"],
    adjustment: 1,
    asOf: "2027-12-31"
  });
  assert.equal(balance.automaticAccrued, 3);
  assert.equal(balance.used, 1);
  assert.equal(balance.available, 3);
});

test("recuperi: compensazione economica e nessun recupero non creano saldo", () => {
  for (const rule of [SUNDAY_HOLIDAY_RULES.ECONOMIC_ONLY, SUNDAY_HOLIDAY_RULES.NONE]) {
    const balance = holidayRecoveryBalance({ year: 2026, rule, adjustment: 8, asOf: "2026-12-31" });
    assert.equal(balance.accrued, 0);
    assert.equal(balance.available, 0);
    assert.equal(canUseSundayHolidayRecovery(balance, "2026-11-10").allowed, false);
  }
});


test("pausa predefinita consolidato: viene sottratta se non esiste una pausa manuale", () => {
  const office = calculateDayWithBreakPolicy(
    [{ type: "entry", at: at("08:35") }, { type: "exit", at: at("16:41") }],
    456, 10, 30, new Date(at("16:41"))
  );
  assert.equal(office.workedMinutes, 456);
  assert.equal(office.pausedMinutes, 30);
  assert.equal(office.breakSource, "default");

  const smart = calculateDayWithPolicies(
    [{ type: "entry", at: at("08:00") }, { type: "exit", at: at("16:36") }],
    456, 10, "smart", { smart: true }, 60, new Date(at("16:36"))
  );
  assert.equal(smart.workedMinutes, 456);
  assert.equal(smart.pausedMinutes, 60);

  const travel = calculateDayWithPolicies(
    [{ type: "entry", at: at("08:00") }, { type: "exit", at: at("16:06") }],
    456, 10, "travel", { travel: true }, 30, new Date(at("16:06"))
  );
  assert.equal(travel.workedMinutes, 456);
});

test("pausa manuale sostituisce la predefinita senza doppio conteggio", () => {
  const events = [
    { type: "entry", at: at("08:35") },
    { type: "pause", at: at("13:00") },
    { type: "resume", at: at("13:15") },
    { type: "exit", at: at("16:26") }
  ];
  const result = calculateDayWithBreakPolicy(events, 456, 10, 60, new Date(at("16:26")));
  assert.equal(result.workedMinutes, 456);
  assert.equal(result.pausedMinutes, 15);
  assert.equal(result.breakSource, "manual");
  assert.equal(formatTime(forecastExit(events.slice(0, -1), 456, 60, new Date(at("14:00")))), "16:26");
});

test("contatore live applica la pausa implicita alle 13 e resta al secondo", () => {
  const before = calculateDayWithBreakPolicy([{ type: "entry", at: at("08:35") }], 456, 10, 30, new Date(at("12:59")));
  const during = calculateDayWithBreakPolicy([{ type: "entry", at: at("08:35") }], 456, 10, 30, new Date("2026-11-26T13:00:07+01:00"));
  assert.equal(before.defaultBreakAppliedSeconds, 0);
  assert.equal(during.defaultBreakAppliedSeconds, 7);
  assert.equal(during.workedSeconds, before.workedSeconds + 60);
});

test("sabato lavorativo: nessun ticket automatico, ma la forzatura resta esplicita", () => {
  const saturday = { work_date: "2026-11-28", actual_type: "office", ticket_override: null };
  assert.equal(isWorkingSaturday(saturday), true);
  assert.equal(ticketForDay({ ticket_office: true }, saturday), false);
  assert.equal(ticketForDay({ ticket_office: true }, { ...saturday, actual_type: "smart" }), false);
  assert.equal(ticketForDay({ ticket_office: true }, { ...saturday, ticket_override: true }), true);
  assert.equal(isWorkingSaturday({ ...saturday, work_date: "2026-11-27" }), false);
});

test("ticket consolidato: ufficio, smart, trasferta e giornata incompleta maturano per default", () => {
  const profile = { ticket_office: true, ticket_smart: true, ticket_travel: true };
  for (const type of ["office", "smart", "travel"]) {
    assert.equal(ticketForDay(profile, { work_date: "2026-11-27", planned_type: type, events: [] }), true);
  }
  assert.equal(ticketForDay(profile, { work_date: "2026-11-27", planned_type: "absence", absence_type: "vacation" }), false);
});

test("festività soppresse: FESTIVO nazionale non viene mescolato alla causale consolidato", () => {
  assert.equal(isSuppressedHolidayDay({ work_date: "2026-01-01", actual_type: "absence", absence_type: "holiday" }), false);
  assert.equal(isSuppressedHolidayDay({ work_date: "2026-01-07", actual_type: "absence", absence_type: "holiday" }), true);
  const days = [
    ...["01-01", "01-06", "04-06", "05-01", "06-02", "12-08", "12-25", "12-26"].map((suffix) => ({
      work_date: `2026-${suffix}`, actual_type: "absence", absence_type: "holiday"
    })),
    ...["01-07", "02-03", "03-04", "04-07"].map((suffix) => ({
      work_date: `2026-${suffix}`, actual_type: "absence", absence_type: "holiday"
    }))
  ];
  assert.equal(annualLeaveBalance({ year: 2026, days }).suppressedHolidays.used, 4);
});

test("riepilogo consolidato 2026: competenza -2 mesi, rettifiche e recupero maggiori prestazioni", () => {
  const jan = [
    { work_date: "2026-01-07", actual_type: "absence", absence_type: "vacation" },
    ...["08", "09", "12", "13"].map((day) => ({ work_date: `2026-01-${day}`, actual_type: "absence", absence_type: "holiday" })),
    { work_date: "2026-01-14", actual_type: "office", ticket_override: false }
  ];
  const mar = [
    { work_date: "2026-03-02", actual_type: "office", overtime_minutes: 200, worked_minutes: 456 },
    { work_date: "2026-03-03", actual_type: "smart", overtime_minutes: 400, worked_minutes: 456 },
    { work_date: "2026-03-04", actual_type: "travel", worked_minutes: 456 },
    { work_date: "2026-03-07", actual_type: "office", worked_minutes: 456 },
    { work_date: "2026-03-09", actual_type: "absence", absence_type: "recovery" }
  ];
  const result = workbookMonthlySummary({
    year: 2026,
    month: 2,
    days: [...jan, ...mar],
    competenceDays: [...jan, ...mar],
    profile: { ticket_office: true, ticket_smart: true, ticket_travel: true },
    targetMinutes: 456
  });
  assert.equal(theoreticalWorkdays(2026, 2), 22);
  assert.equal(result.mealVouchers, 16); // 22 teorici del mese di accredito - 5 causali di gennaio - 1 rettifica NO
  assert.equal(result.mealVoucherCompetenceAdjustments, -1);
  assert.equal(result.mealVouchersEarned, 3); // il sabato e REC. MAGG. PRES. non maturano
  assert.equal(result.workingSaturdays, 1);
  assert.equal(result.overtimeMinutes, 600);
  assert.equal(result.performanceRecoveryMinutes, 456);
  assert.equal(result.netOvertimeMinutes, 144);
});

test("recupero riposo festività 2026: un utilizzo su due domeniche riconosciute", () => {
  const balance = holidayRecoveryBalance({
    year: 2026,
    rule: SUNDAY_HOLIDAY_RULES.ACCRUE_DAY,
    usedDates: ["2026-11-02"],
    asOf: "2026-12-31"
  });
  assert.equal(balance.accrued, 2);
  assert.equal(balance.used, 1);
  assert.equal(balance.available, 1);
});


test("malattia bambino: il plafond riparte esattamente il giorno del compleanno", () => {
  const elena = { id: "elena", birth_date: "2025-11-30" };
  const before = childSicknessEntitlement(elena, "2026-11-29", 7, 0);
  const birthday = childSicknessEntitlement(elena, "2026-11-30", 0, 0);
  assert.equal(before.lifeYear, 1);
  assert.equal(before.periodEnd, "2026-11-29");
  assert.equal(before.remainingPaidDays, 23);
  assert.equal(birthday.lifeYear, 2);
  assert.equal(birthday.periodStart, "2026-11-30");
  assert.equal(birthday.remainingPaidDays, 30);
});

test("malattia bambino: periodi storici separati per figlio e anno di vita", () => {
  const periods = childSicknessPeriodsForYear({ id: "elena", birth_date: "2025-11-30" }, 2026);
  assert.deepEqual(periods.map((period) => [period.periodKey, period.displayStart, period.displayEnd, period.limit]), [
    ["life-1-2025-11-30", "2026-01-01", "2026-11-29", 30],
    ["life-2-2025-11-30", "2026-11-30", "2026-12-31", 30]
  ]);
  const elena = childSicknessEntitlement({ birth_date: "2025-11-30" }, "2026-06-01", 7, 0);
  const marco = childSicknessEntitlement({ birth_date: "2025-11-30" }, "2026-06-01", 2, 0);
  assert.equal(elena.remainingPaidDays, 23);
  assert.equal(marco.remainingPaidDays, 28);
});

test("malattia bambino: al terzo compleanno passa al plafond per anno solare", () => {
  const child = { birth_date: "2023-11-30" };
  const before = childSicknessEntitlement(child, "2026-11-29", 5, 0);
  const birthday = childSicknessEntitlement(child, "2026-11-30", 0, 0);
  const nextYear = childSicknessEntitlement(child, "2027-01-01", 0, 0);
  assert.equal(before.tier, "under_three");
  assert.equal(before.lifeYear, 3);
  assert.equal(birthday.tier, "three_to_fourteen");
  assert.equal(birthday.periodKind, "calendar_year");
  assert.equal(birthday.periodStart, "2026-11-30");
  assert.equal(birthday.remainingDays, 10);
  assert.equal(nextYear.periodStart, "2027-01-01");
  assert.equal(nextYear.remainingDays, 10);
});


test("paternità obbligatoria: finestra, scadenza e residuo storico per evento", () => {
  const child = { birth_date: "2026-12-05", expected_birth_date: "2026-11-30", paternity_event_type: "birth" };
  const before = paternityMandatoryEntitlement(child, "2026-09-29", 0);
  const firstDay = paternityMandatoryEntitlement(child, "2026-09-30", 3);
  const lastDay = paternityMandatoryEntitlement(child, "2027-05-05", 3);
  const expired = paternityMandatoryEntitlement(child, "2027-05-06", 3);
  assert.equal(before.status, "upcoming");
  assert.equal(firstDay.status, "active");
  assert.equal(firstDay.windowStart, "2026-09-30");
  assert.equal(lastDay.windowEnd, "2027-05-05");
  assert.equal(lastDay.remainingDays, 7);
  assert.equal(expired.status, "expired");
  assert.equal(expired.availableDays, 0);
  assert.equal(expired.expiredUnusedDays, 7);
});

test("paternità obbligatoria: parto plurimo e più figli hanno plafond indipendenti", () => {
  const twins = paternityMandatoryEntitlement({ birth_date: "2026-06-01", multiple_birth: true }, "2026-07-01", 6);
  const first = paternityMandatoryEntitlement({ birth_date: "2026-06-01" }, "2026-07-01", 4);
  const second = paternityMandatoryEntitlement({ birth_date: "2026-09-01" }, "2026-10-01", 1);
  assert.equal(twins.totalDays, 20);
  assert.equal(twins.remainingDays, 14);
  assert.equal(first.remainingDays, 6);
  assert.equal(second.remainingDays, 9);
});

test("maternità obbligatoria: calcola le modalità 2+3, 1+4 e 0+5", () => {
  const base = { birth_date: "2026-12-05", expected_birth_date: "2026-11-30" };
  const ordinary = maternityMandatoryEntitlement({ ...base, maternity_mode: "2+3" }, "2026-10-01", 5);
  const flexible = maternityMandatoryEntitlement({ ...base, maternity_mode: "1+4" }, "2026-11-01", 5);
  const afterBirth = maternityMandatoryEntitlement({ ...base, maternity_mode: "0+5" }, "2026-12-05", 0);
  assert.deepEqual([ordinary.windowStart, ordinary.windowEnd], ["2026-09-30", "2027-03-05"]);
  assert.deepEqual([flexible.windowStart, flexible.windowEnd], ["2026-10-30", "2027-04-05"]);
  assert.deepEqual([afterBirth.windowStart, afterBirth.windowEnd], ["2026-12-05", "2027-05-05"]);
  assert.equal(ordinary.requiresCertification, false);
  assert.equal(flexible.requiresCertification, true);
  assert.equal(afterBirth.requiresCertification, true);
});

test("maternità obbligatoria: la data reale aggiorna il termine senza creare un reset", () => {
  const planned = maternityMandatoryEntitlement({
    birth_date: "2026-12-05", expected_birth_date: "2026-11-30", maternity_mode: "1+4"
  }, "2027-04-06", 40);
  const updated = maternityMandatoryEntitlement({
    birth_date: "2026-12-10", expected_birth_date: "2026-11-30", maternity_mode: "1+4"
  }, "2027-04-06", 40);
  assert.equal(planned.windowEnd, "2027-04-05");
  assert.equal(planned.status, "expired");
  assert.equal(updated.windowEnd, "2027-04-10");
  assert.equal(updated.status, "active");
  assert.equal(updated.usedDays, 40);
});


test("malattia bambino mostra il solo periodo vigente ai confini dei primi tre compleanni", () => {
  const child = { id: "elena", birth_date: "2025-11-30" };
  const beforeFirst = childSicknessEntitlement(child, "2026-11-29");
  const firstBirthday = childSicknessEntitlement(child, "2026-11-30");
  const secondBirthday = childSicknessEntitlement(child, "2027-11-30");
  const thirdBirthday = childSicknessEntitlement(child, "2028-11-30");
  assert.equal(beforeFirst.lifeYear, 1);
  assert.equal(beforeFirst.periodEnd, "2026-11-29");
  assert.equal(firstBirthday.lifeYear, 2);
  assert.equal(firstBirthday.periodStart, "2026-11-30");
  assert.equal(secondBirthday.lifeYear, 3);
  assert.equal(secondBirthday.periodStart, "2027-11-30");
  assert.equal(thirdBirthday.tier, "three_to_fourteen");
  assert.equal(thirdBirthday.periodStart, "2028-11-30");
  assert.equal(thirdBirthday.totalDaysLimit, 10);
});

test("riconcilia lo storico malattia bambino non collegato solo con un figlio compatibile", () => {
  const children = [{ id: "elena", birth_date: "2025-11-30" }];
  const days = Array.from({ length: 7 }, (_, index) => ({
    work_date: `2026-0${index < 4 ? 7 : 8}-${String((index % 4) + 1).padStart(2, "0")}`,
    actual_type: "absence",
    absence_type: "child_sickness",
    child_id: null
  }));
  const reconciled = reconcileChildSicknessDays(days, children);
  assert.equal(reconciled.filter((day) => day.child_id === "elena").length, 7);
  assert.equal(reconciled.filter((day) => day.child_link_reconciled).length, 7);
  const active = childSicknessEntitlement(children[0], "2026-11-26", reconciled.length);
  assert.equal(active.lifeYear, 1);
  assert.equal(active.usedDays, 7);
  assert.equal(active.remainingPaidDays, 23);
});

test("non riconcilia automaticamente quando più figli sono compatibili", () => {
  const days = [{ work_date: "2026-07-01", actual_type: "absence", absence_type: "child_sickness", child_id: null }];
  const children = [
    { id: "a", birth_date: "2025-11-30" },
    { id: "b", birth_date: "2025-12-15" }
  ];
  const [day] = reconcileChildSicknessDays(days, children);
  assert.equal(day.child_id, null);
  assert.equal(day.child_link_reconciled, undefined);
});

test("più figli mantengono periodi attivi e saldi indipendenti", () => {
  const elena = childSicknessEntitlement({ id: "elena", birth_date: "2025-11-30" }, "2026-11-26", 7);
  const marco = childSicknessEntitlement({ id: "marco", birth_date: "2024-06-10" }, "2026-11-26", 2);
  assert.equal(elena.lifeYear, 1);
  assert.equal(elena.remainingPaidDays, 23);
  assert.equal(marco.lifeYear, 3);
  assert.equal(marco.remainingPaidDays, 28);
});


test("congedo parentale: limiti individuali, di coppia e genitore solo", () => {
  assert.deepEqual(parentalLeaveLimits({ role: "mother", familySituation: "couple" }), {
    role: "mother", familySituation: "couple", fatherAtLeastThreeMonths: false,
    individualMonths: 6, coupleMonths: 10, childAgeLimitYears: 14
  });
  assert.equal(parentalLeaveLimits({ role: "father", familySituation: "couple" }).individualMonths, 6);
  const extendedFather = parentalLeaveLimits({ role: "father", familySituation: "couple", fatherAtLeastThreeMonths: true });
  assert.equal(extendedFather.individualMonths, 7);
  assert.equal(extendedFather.coupleMonths, 11);
  const motherWithExtendedCouple = parentalLeaveLimits({ role: "mother", familySituation: "couple", fatherAtLeastThreeMonths: true });
  assert.equal(motherWithExtendedCouple.individualMonths, 6);
  assert.equal(motherWithExtendedCouple.coupleMonths, 11);
  const single = parentalLeaveLimits({ role: "mother", familySituation: "single_parent" });
  assert.equal(single.individualMonths, 11);
  assert.equal(single.coupleMonths, 11);
});

test("congedo parentale: la quota scelta è esplicita e validata sul limite individuale", () => {
  const motherLimits = parentalLeaveLimits({ role: "mother", familySituation: "couple" });
  assert.deepEqual(validateParentalLeaveQuota("", motherLimits), { valid: true, value: null, reason: "" });
  assert.equal(validateParentalLeaveQuota(5.5, motherLimits).value, 5.5);
  assert.equal(validateParentalLeaveQuota(6, motherLimits).valid, true);
  assert.equal(validateParentalLeaveQuota(6.5, motherLimits).valid, false);
  const singleLimits = parentalLeaveLimits({ role: "father", familySituation: "single_parent" });
  assert.equal(validateParentalLeaveQuota(11, singleLimits).valid, true);
});

test("malattia bambino: il conteggio principale non supera la quota del periodo", () => {
  const child = { id: "elena", birth_date: "2025-11-30" };
  const underThree = childSicknessEntitlement(child, "2026-11-26", 34, 2);
  assert.equal(underThree.usedDays, 36);
  assert.equal(underThree.quotaUsedDays, 30);
  assert.equal(underThree.excessDays, 6);
  assert.equal(underThree.remainingPaidDays, 0);
  const older = childSicknessEntitlement({ birth_date: "2020-01-01" }, "2026-11-26", 12, 0);
  assert.equal(older.quotaUsedDays, 10);
  assert.equal(older.excessDays, 2);
});
