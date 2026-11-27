import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllocationDurations,
  equalPercentages,
  hoursToMinutes,
  initialAllocationProjectIds,
  minutesToPercentageInput,
  percentageToMinutes,
  splitEvenMinutes
} from '../src/project-allocation-policy.mjs';

test('una commessa senza ore riceve il 100% del lavorato', () => {
  assert.deepEqual(buildAllocationDurations({ mode: 'automatic', projectIds: ['a'], workedMinutes: 456 }), [
    { projectId: 'a', durationMinutes: 456 }
  ]);
  assert.deepEqual(equalPercentages(1), [100]);
});

test('due commesse senza ore ricevono 50% e 50%', () => {
  assert.deepEqual(splitEvenMinutes(456, 2), [228, 228]);
  assert.deepEqual(equalPercentages(2), [50, 50]);
});

test('tre commesse dividono tutto il lavorato senza perdere minuti', () => {
  const values = splitEvenMinutes(456, 3);
  assert.deepEqual(values, [152, 152, 152]);
  assert.equal(values.reduce((sum, value) => sum + value, 0), 456);
  assert.equal(equalPercentages(3).reduce((sum, value) => sum + value, 0), 100);
});

test('le ore manuali sono specifiche per ogni commessa', () => {
  assert.deepEqual(buildAllocationDurations({
    mode: 'hours', projectIds: ['a', 'b'], workedMinutes: 456, manualHours: { a: '3.5', b: '4,1' }
  }), [
    { projectId: 'a', durationMinutes: 210 },
    { projectId: 'b', durationMinutes: 246 }
  ]);
  assert.equal(hoursToMinutes('7,6'), 456);
});

test('l’automatico senza orario lavorato non crea allocazioni fittizie', () => {
  assert.throws(() => buildAllocationDurations({ mode: 'automatic', projectIds: ['a'], workedMinutes: 0 }), /orario lavorato/i);
});


test('una nuova registrazione non preseleziona la commessa usata in precedenza', () => {
  assert.deepEqual(initialAllocationProjectIds([]), []);
});

test('la modifica conserva soltanto le commesse già salvate sulla giornata', () => {
  assert.deepEqual(initialAllocationProjectIds(['esistente', 'esistente', 'altra']), ['esistente', 'altra']);
});

test('percentuale e minuti della singola allocazione sono convertiti in modo coerente', () => {
  assert.equal(minutesToPercentageInput(228, 456), '50');
  assert.equal(percentageToMinutes(456, '37,5'), 171);
  assert.throws(() => percentageToMinutes(456, '0'), /percentuale/i);
  assert.throws(() => percentageToMinutes(456, '101'), /100%/i);
});
