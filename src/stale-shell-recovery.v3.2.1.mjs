const TARGET_BUILD = '3.2.1';
const marker = 'chronoFlowUiRecovery';
function targetUrl() {
  const url = new URL('./', window.location.href);
  url.searchParams.set('ui', TARGET_BUILD);
  url.hash = '';
  return url.href;
}
if (document.documentElement.dataset[marker] !== TARGET_BUILD) {
  document.documentElement.dataset[marker] = TARGET_BUILD;
  window.location.replace(targetUrl());
}
