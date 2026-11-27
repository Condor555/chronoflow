const TARGET_BUILD = '3.2.0';
const marker = 'chronoFlowUiRecovery';

function targetUrl() {
  const url = new URL('./', window.location.href);
  url.searchParams.set('ui', TARGET_BUILD);
  url.hash = '';
  return url.href;
}

// This module is loaded only by obsolete 3.0.x minimal shells. It deliberately
// does not try to mount the full application into the incompatible fallback DOM.
// A cache-busted navigation lets the network-first worker fetch the authoritative
// 2.9.4-derived index.html.
if (document.documentElement.dataset[marker] !== TARGET_BUILD) {
  document.documentElement.dataset[marker] = TARGET_BUILD;
  window.location.replace(targetUrl());
}
