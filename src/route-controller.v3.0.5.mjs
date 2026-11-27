export function requestedRoute(locationLike = {}) {
  const hash = String(locationLike.hash || '').toLowerCase();
  const search = String(locationLike.search || '');
  const view = new URLSearchParams(search).get('view');
  return hash === '#calendar' || view === 'calendar' ? 'calendar' : 'home';
}

export function createRouteController({ renderAuth, renderHome, renderCalendar }) {
  if (typeof renderAuth !== 'function' || typeof renderHome !== 'function' || typeof renderCalendar !== 'function') {
    throw new Error('Renderer di navigazione non configurati.');
  }

  async function initial(session, locationLike) {
    if (!session) { await renderAuth(); return 'auth'; }
    const route = requestedRoute(locationLike);
    if (route === 'calendar') await renderCalendar();
    else await renderHome();
    return route;
  }

  async function go(route) {
    if (route === 'calendar') { await renderCalendar(); return 'calendar'; }
    await renderHome();
    return 'home';
  }

  return {
    initial,
    go,
    async resilientInitial(session, locationLike, onCalendarError = () => {}) {
      try {
        return await initial(session, locationLike);
      } catch (error) {
        if (!session || requestedRoute(locationLike) !== 'calendar') throw error;
        onCalendarError(error);
        await renderHome();
        return 'home';
      }
    }
  };
}
