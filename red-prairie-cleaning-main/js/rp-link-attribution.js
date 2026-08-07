/* Forwards Google Ads / UTM attribution params onto /book links.
   Runs once on page load. If there's nothing to forward, it does no DOM work. */
(function () {
  var TRACKED = ["gclid", "gbraid", "wbraid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid"];
  var current = new URLSearchParams(window.location.search);
  var toForward = new URLSearchParams();
  TRACKED.forEach(function (key) {
    var val = current.get(key);
    if (val) toForward.set(key, val);
  });
  if (!toForward.toString()) return;

  document.querySelectorAll('a[href^="/book"]').forEach(function (link) {
    try {
      var url = new URL(link.getAttribute("href"), window.location.origin);
      toForward.forEach(function (value, key) { url.searchParams.set(key, value); });
      link.setAttribute("href", url.pathname + "?" + url.searchParams.toString());
    } catch (e) { /* leave the link untouched if anything unexpected happens */ }
  });
})();
