import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteController, requestedRoute } from '../src/route-controller.v3.0.5.mjs';

function harness() {
  const calls = [];
  return {
    calls,
    routes: createRouteController({
      async renderAuth() { calls.push('auth'); },
      async renderHome() { calls.push('home'); },
      async renderCalendar() { calls.push('calendar'); }
    })
  };
}

for (const flow of ['login', 'reload', 'riapertura PWA']) {
  test(`${flow} -> Home/Oggi`, async () => {
    const { calls, routes } = harness();
    assert.equal(await routes.initial({ user: { id: 'u1' } }, { hash: '', search: '' }), 'home');
    assert.deepEqual(calls, ['home']);
  });
}

test('click Calendario -> Calendario senza cambiare la route iniziale', async () => {
  const { calls, routes } = harness();
  await routes.initial({ user: { id: 'u1' } }, { hash: '', search: '' });
  assert.equal(await routes.go('calendar'), 'calendar');
  assert.deepEqual(calls, ['home', 'calendar']);
});

test('logout/sessione assente -> login', async () => {
  const { calls, routes } = harness();
  assert.equal(await routes.initial(null, { hash: '', search: '' }), 'auth');
  assert.deepEqual(calls, ['auth']);
});

test('solo un deep link esplicito e supportato può aprire Calendario', async () => {
  assert.equal(requestedRoute({ hash: '#calendar', search: '' }), 'calendar');
  assert.equal(requestedRoute({ hash: '', search: '?view=calendar' }), 'calendar');
  assert.equal(requestedRoute({ hash: '#last-view', search: '' }), 'home');
});

test('un guasto del Calendario non blocca bootstrap o Home', async () => {
  const calls = [];
  const expected = new Error('calendar module failed');
  const routes = createRouteController({
    async renderAuth() { calls.push('auth'); },
    async renderHome() { calls.push('home'); },
    async renderCalendar() { calls.push('calendar'); throw expected; }
  });
  let caught;
  assert.equal(await routes.resilientInitial(
    { user: { id: 'u1' } },
    { hash: '#calendar', search: '' },
    (error) => { caught = error; }
  ), 'home');
  assert.equal(caught, expected);
  assert.deepEqual(calls, ['calendar', 'home']);
});
