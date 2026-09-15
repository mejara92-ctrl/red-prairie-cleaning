/* Round 48: shows/hides the fixed mobile "Estimate / Text" bar that sits at
   the bottom of the screen on phones. The CSS for .sticky-mobile-cta.is-visible
   already existed on every marketing page (the fade/slide-in transition), but
   nothing ever added the is-visible class -- the bar was permanently
   opacity:0 with pointer-events:none, so it never appeared no matter how far
   you scrolled. This is the missing piece: appear once the hero (and its own
   in-page CTA buttons) has scrolled past, hide again near the very top.
   Single shared file so every page gets the fix the same way, instead of a
   copy-pasted inline script per page. Safe no-op on any page without a
   .sticky-mobile-cta element (e.g. /pricing, which has its own footer CTA). */
(function () {
  "use strict";
  function init() {
    var bar = document.querySelector(".sticky-mobile-cta");
    if (!bar) return;
    var hero = document.querySelector(".hero");
    var shown = false;
    function threshold() {
      return hero ? hero.offsetTop + hero.offsetHeight : 420;
    }
    function check() {
      var y = window.scrollY || window.pageYOffset || 0;
      var should = y > threshold();
      if (should !== shown) {
        shown = should;
        bar.classList.toggle("is-visible", should);
      }
    }
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    check();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
