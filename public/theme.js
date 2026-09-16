/* Shared by the live portal and the static mirror; runs before first paint. */
(function () {
  'use strict';
  var key = 'tokfire-color-theme';
  var system = window.matchMedia('(prefers-color-scheme: dark)');
  var preference = null;
  try { preference = localStorage.getItem(key); } catch (_) { /* Storage may be blocked. */ }
  function apply() {
    document.documentElement.dataset.theme = preference === 'light' || preference === 'dark'
      ? preference : system.matches ? 'dark' : 'light';
  }
  apply();
  document.addEventListener('click', function (event) {
    if (!(event.target instanceof Element) || !event.target.closest('[data-theme-toggle]')) return;
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, preference); } catch (_) { /* Still work for this page. */ }
    apply();
  });
  system.addEventListener('change', apply);
  window.addEventListener('storage', function (event) {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue;
    apply();
  });
}());
