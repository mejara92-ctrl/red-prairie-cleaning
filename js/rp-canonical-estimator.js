/*
  Red Prairie Cleaning canonical estimator override.
  Purpose: keep every landing page using the same booking/estimator behavior as the homepage.
  This script intentionally overrides older per-page estimator functions after the page loads.
*/
(function () {
  if (window.__RP_CANONICAL_ESTIMATOR_LOADED__) return;
  window.__RP_CANONICAL_ESTIMATOR_LOADED__ = true;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!document.getElementById('rpApp')) return;
    if (typeof rpState === 'undefined') return;

    var RP_CALENDAR_URL = 'https://api.leadconnectorhq.com/widget/booking/1VXLRmyHfLdsHa4rTKJ2';

    var services = {
      moveout: { name: 'Factory Reset™ Move-Out Cleaning', emoji: '🚚', base: 0 },
      movein: { name: 'Factory Reset™ Move-In Cleaning', emoji: '🔑', base: 0 },
      deep: { name: 'Deep Cleaning', emoji: '✨', base: 249 },
      maintenance: { name: 'Basic Cleaning', emoji: '🏠', base: 149 },
      airbnb: { name: 'Airbnb Turnover Cleaning', emoji: '🧺', base: 0 },
      carpet: { name: 'Professional Carpet Extraction', emoji: '🧼', base: 75 },
      upholstery: { name: 'Professional Upholstery Cleaning', emoji: '🛋️', base: 0 },
      commercial: { name: 'Commercial Cleaning', emoji: '🏢', base: 0 }
    };

    var upholsteryPrices = {
      chair: { label: 'Dining Chair', price: 100 },
      recliner: { label: 'Recliner', price: 125 },
      loveseat: { label: 'Loveseat', price: 150 },
      sofa: { label: 'Sofa', price: 175 },
      sectional: { label: 'Sectional (up to 5 seats)', price: 250 },
      large_sectional: { label: 'Large Sectional (6+ seats or chaise)', price: 325 }
    };

    var moveoutPrices = { 1: 199, 2: 299, 3: 399, 4: 499 };
    var moveinPrices = { 1: 199, 2: 299, 3: 399, 4: 499 };

    function patchState() {
      if (!rpState.service) rpState.service = null;
      if (typeof rpState.bedrooms === 'undefined') rpState.bedrooms = null;
      if (typeof rpState.bathrooms === 'undefined') rpState.bathrooms = null;
      if (typeof rpState.carpetRooms === 'undefined') rpState.carpetRooms = 0;
      if (typeof rpState.exteriorWindows === 'undefined') rpState.exteriorWindows = false;
      if (typeof rpState.upholsteryType === 'undefined') rpState.upholsteryType = null;
      if (typeof rpState.upholsteryLabel === 'undefined') rpState.upholsteryLabel = '';
      if (typeof rpState.upholsteryPrice === 'undefined') rpState.upholsteryPrice = 0;
      if (typeof rpState.fullName === 'undefined') rpState.fullName = '';
      if (typeof rpState.phone === 'undefined') rpState.phone = '';
      if (typeof rpState.email === 'undefined') rpState.email = '';
      if (typeof rpState.address1 === 'undefined') rpState.address1 = '';
      if (typeof rpState.city === 'undefined') rpState.city = '';
      if (typeof rpState.state === 'undefined') rpState.state = 'OK';
      if (typeof rpState.postalCode === 'undefined') rpState.postalCode = '';
      if (typeof rpState.specialInstructions === 'undefined') rpState.specialInstructions = '';
      if (typeof rpState.estimateSent === 'undefined') rpState.estimateSent = false;
      if (typeof rpState.preBookingWebhookSent === 'undefined') rpState.preBookingWebhookSent = false;
    }

    function getServiceMap() {
      return (typeof rpServices !== 'undefined' && rpServices) ? rpServices : services;
    }

    function scrollToCalculator(instant) {
      var card = document.querySelector('.rp-card');
      if (!card) return;
      var nav = document.querySelector('.navbar');
      var navHeight = nav ? nav.offsetHeight : 70;
      var y = card.getBoundingClientRect().top + window.pageYOffset - navHeight - 10;
      window.scrollTo({ top: Math.max(0, y), behavior: instant ? 'auto' : 'smooth' });
    }

    function maxSteps() { return 5; }

    function estimatePhase() {
      var step = Number(rpState.step || 1);
      if (step <= 1) return { label: 'Choose Service', pct: 20 };
      if (step === 2) return { label: 'What\'s Included', pct: 40 };
      if (step === 3 || step === 4) return { label: 'Home Details', pct: 60 };
      if (step === 5) return { label: 'Instant Price', pct: 80 };
      return { label: 'Book Appointment', pct: 100 };
    }

    function updateProgress() {
      var stepText = document.getElementById('rpStepText');
      var fill = document.getElementById('rpProgressFill');
      var phase = estimatePhase();
      if (stepText) stepText.innerHTML = '<strong>' + phase.label + '</strong> · service → details → price → book';
      if (fill) fill.style.width = phase.pct + '%';
    }

    function calculatePrice() {
      patchState();
      if (!rpState.service) return 0;
      if (rpState.service === 'moveout' || rpState.service === 'movein') {
        var bedrooms = Number(rpState.bedrooms || 0);
        var table = rpState.service === 'movein' ? moveinPrices : moveoutPrices;
        var total = bedrooms ? (table[Math.min(bedrooms, 4)] || 499) : 0;
        total += Number(rpState.carpetRooms || 0) * 75;
        if (rpState.exteriorWindows) total += 100;
        return total;
      }
      if (rpState.service === 'carpet') return Number(rpState.carpetRooms || 0) * 75;
      if (rpState.service === 'upholstery') return Number(rpState.upholsteryPrice || 0);
      var serviceMap = getServiceMap();
      var base = serviceMap[rpState.service] && serviceMap[rpState.service].base ? serviceMap[rpState.service].base : (services[rpState.service] ? services[rpState.service].base : 0);
      var b = Number(rpState.bedrooms || 0);
      var baths = Number(rpState.bathrooms || 0);
      if (!b) return base;
      var subtotal = base + Math.max(0, b - 1) * 25 + Math.max(0, baths - 1) * 25;
      if (rpState.service === 'deep') {
        subtotal += Number(rpState.carpetRooms || 0) * 75;
        if (rpState.exteriorWindows) subtotal += 100;
      }
      return subtotal;
    }

    function priceLabel() {
      var total = calculatePrice();
      return total ? ('$' + total) : '$0';
    }

    function livePrice(note) {
      var total = calculatePrice();
      var displayNote = total ? ('✓ Nice — ' + note) : note;
      return '<div class="rp-live-price"><small>Current Estimate</small><strong>' + priceLabel() + '</strong><span>' + displayNote + '</span></div>';
    }

    function serviceBlurb(serviceKey) {
      var blurbs = {
        moveout: 'Perfect for renters, inspections, key handoff, and property turnovers.',
        movein: 'A detailed reset before boxes, furniture, kids, pets, and real life move in.',
        deep: 'A heavier one-time clean for lived-in homes with buildup, dust, and grime.',
        maintenance: 'Basic routine upkeep for homes already in decent shape.',
        carpet: 'Hot-water extraction for carpeted bedrooms, living areas, and hallways.',
        upholstery: 'Fabric furniture cleaning for sofas, loveseats, recliners, chairs, and sectionals.'
      };
      return blurbs[serviceKey] || 'Professional cleaning from Red Prairie Cleaning.';
    }

    function serviceDuration(serviceKey) {
      if (serviceKey === 'moveout' || serviceKey === 'movein') return 'Estimated time: 6–10 hours depending on severity · Crew: 2 cleaning professionals';
      if (serviceKey === 'deep') return 'Estimated time: up to 6 hours · Crew: 1 cleaning professional';
      if (serviceKey === 'maintenance') return 'Estimated time: up to 4 hours · Crew: 1 cleaning professional';
      if (serviceKey === 'carpet') return 'Estimated time varies by room count';
      if (serviceKey === 'upholstery') return 'Estimated time varies by furniture item';
      return '';
    }

    function serviceIncludes(serviceKey) {
      var lists = {
        moveout: [
          'Full top-to-bottom interior cleaning', 'All major appliances — inside + outside', 'Oven, microwave + refrigerator interiors', 'Cabinets + drawers — inside + outside', 'Bathrooms fully scrubbed + sanitized',
          'Showers, tubs, toilets, sinks + mirrors', 'Doors, trim + baseboards', 'Interior windows + tracks', 'Floors vacuumed + mopped', 'Reasonable wall scuffs', 'Basic garage sweep'
        ],
        movein: [
          'Full top-to-bottom interior cleaning', 'All major appliances — inside + outside', 'Oven, microwave + refrigerator interiors', 'Cabinets + drawers — inside + outside', 'Bathrooms fully scrubbed + sanitized',
          'Showers, tubs, toilets, sinks + mirrors', 'Doors, trim + baseboards', 'Interior windows + tracks', 'Floors vacuumed + mopped', 'Move-in ready finish'
        ],
        deep: [
          'Kitchen and bathroom detail cleaning', 'Built-up dust and grime removal', 'Baseboards, doors, and common touch points', 'Floors vacuumed and mopped',
          'Exterior surfaces of appliances', 'General detail reset for lived-in homes'
        ],
        maintenance: [
          'Kitchen maintenance cleaning', 'Bathroom maintenance cleaning', 'Dusting common surfaces', 'Floors vacuumed and mopped', 'Routine upkeep for maintained homes'
        ],
        carpet: [
          'Pre-spray treatment', 'Hot-water extraction cleaning', 'Carpeted bedrooms, living areas, or hallways', 'Great for move-out requirements and traffic lanes'
        ],
        upholstery: [
          'Fabric inspection before cleaning', 'Professional upholstery extraction', 'Sofas, loveseats, recliners, chairs, or sectionals', 'Helps refresh furniture and remove normal soil'
        ]
      };
      return lists[serviceKey] || [];
    }

    function renderIncludedStep() {
      var serviceMap = getServiceMap();
      var service = serviceMap[rpState.service] || services[rpState.service] || { name: 'Cleaning', emoji: '' };
      var includes = serviceIncludes(rpState.service).map(function (item) { return '<li>✓ ' + item + '</li>'; }).join('');
      var trust = '';
      if (rpState.service === 'moveout') {
        trust = '<div class="rp-guarantee"><strong>Inspection-Ready Re-Clean Guarantee</strong><span>We clean the in-scope areas to help prevent cleanliness from being the reason a security deposit is reduced. If a landlord or property manager identifies an in-scope area we missed, contact us within 48 hours and we will return to re-clean it at no charge.</span></div>';
      } else {
        trust = '<div class="rp-guarantee"><strong>Satisfaction Re-Clean Guarantee</strong><span>If we miss an in-scope area, contact us within 48 hours and we will return to re-clean it at no charge.</span></div>';
      }
      document.getElementById('rpApp').innerHTML =
        '<div class="rp-service-intro"><p class="rp-tap-note">You selected</p><h2>' + (service.emoji || '') + ' ' + service.name + '</h2><p class="rp-sub">' + serviceBlurb(rpState.service) + '</p></div>' +
        '<div class="rp-included"><div class="rp-included-title">What\'s Included</div><ul class="rp-checklist rp-checklist-list">' + includes + '</ul></div>' +
        '<div class="rp-duration-note">' + serviceDuration(rpState.service) + '</div>' + trust +
        '<div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button><button class="rp-primary" onclick="rpContinueFromIncludes()">Continue Booking</button></div>';
    }

    function render() {
      patchState();
      updateProgress();
      var app = document.getElementById('rpApp');
      if (!app) return;

      if (rpState.step === 1 || !rpState.step) {
        app.innerHTML =
          '<h2>Choose your cleaning service</h2>' +
          '<div class="rp-estimator-help rp-service-prompt">Choose the cleaning service you need. Next, we’ll show exactly what is included before you receive pricing.</div>' +
          '<div class="rp-grid">' +
          '<button class="rp-option featured-option" onclick="rpSelectService(&quot;moveout&quot;)"><span class="badge">Most Popular</span><strong>🚚 Move-Out Cleaning</strong><span>Factory Reset™ for renters, inspections & turnovers.</span></button>' +
          '<button class="rp-option" onclick="rpSelectService(&quot;movein&quot;)"><span class="badge">Second Most Popular</span><strong>🔑 Move-In Cleaning</strong><span>Factory Reset™ before boxes and furniture arrive.</span></button>' +
          '<button class="rp-option" onclick="rpSelectService(&quot;deep&quot;)"><strong>✨ Deep Clean</strong><span>Heavy detail clean for lived-in homes.</span></button>' +
          '<button class="rp-option" onclick="rpSelectService(&quot;maintenance&quot;)"><strong>🏠 Basic Clean</strong><span>Routine upkeep for maintained homes.</span></button>' +
          '<button class="rp-option" onclick="rpSelectService(&quot;airbnb&quot;)"><strong>🧺 Airbnb Turnover</strong><span>Guest-ready reset. Text for quote.</span></button>' +
          '<button class="rp-option" onclick="rpSelectService(&quot;carpet&quot;)"><strong>🧼 Carpet Cleaning</strong><span>$75 per carpeted room.</span></button>' +
          '<button class="rp-option" onclick="rpSelectService(&quot;upholstery&quot;)"><strong>🛋️ Upholstery Cleaning</strong><span>Sofas, recliners & sectionals.</span></button>' +
          '<button class="rp-option" onclick="rpSelectService(&quot;commercial&quot;)"><strong>🏢 Commercial Cleaning</strong><span>Text for quote. Small office/light commercial.</span></button>' +
          '</div>';
        return;
      }

      if (rpState.step === 2) return renderIncludedStep();

      if (rpState.step === 3 && (rpState.service === 'moveout' || rpState.service === 'movein')) {
        var isMoveIn = rpState.service === 'movein';
        var table = isMoveIn ? moveinPrices : moveoutPrices;
        app.innerHTML =
          '<h2>How many bedrooms?</h2><p class="rp-sub">This sets the base price for your ' + (isMoveIn ? 'move-in' : 'move-out') + ' cleaning.</p>' +
          '<div class="rp-pill-grid">' + [1,2,3,4].map(function (n) { return '<button class="rp-pill" onclick="rpSelectBedrooms(' + n + ')">' + n + ' Bedroom<br><small>$' + table[n] + '</small></button>'; }).join('') + '</div>' +
          '<div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button></div>';
        return;
      }

      if (rpState.step === 3 && (rpState.service === 'airbnb' || rpState.service === 'commercial')) {
        app.innerHTML =
          '<h2>Text us for a quote</h2><p class="rp-sub">This service is custom priced. Send your info and we will text you back with the right quote.</p>' +
          '<div class="rp-guarantee"><strong>No photo upload required</strong><span>We just need your contact info and a short description of what you need.</span></div>' +
          '<div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button><button class="rp-primary" onclick="rpGoToLead()">Text for Quote</button></div>';
        return;
      }

      if (rpState.step === 3 && rpState.service === 'carpet') {
        app.innerHTML =
          '<h2>How many carpeted rooms?</h2><p class="rp-sub">Carpet extraction cleaning is $75 per carpeted room.</p>' +
          '<div class="rp-pill-grid">' + [1,2,3,4,5,6].map(function (n) { return '<button class="rp-pill" onclick="rpSelectCarpetOnlyRooms(' + n + ')">' + n + (n === 6 ? '+' : '') + '<br><small>$' + (n * 75) + (n === 6 ? '+' : '') + '</small></button>'; }).join('') + '</div>' +
          '<div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button></div>';
        return;
      }

      if (rpState.step === 3 && rpState.service === 'upholstery') {
        app.innerHTML =
          '<h2>What upholstery are we cleaning?</h2><p class="rp-sub">Choose the closest furniture item.</p>' +
          '<div class="rp-grid">' +
          '<button class="rp-option" onclick="rpSelectUpholstery(\'chair\')"><strong>🪑 Dining Chair</strong><span>$100 minimum upholstery cleaning.</span></button>' +
          '<button class="rp-option" onclick="rpSelectUpholstery(\'recliner\')"><strong>💺 Recliner</strong><span>$125 professional upholstery cleaning.</span></button>' +
          '<button class="rp-option" onclick="rpSelectUpholstery(\'loveseat\')"><strong>🛋️ Loveseat</strong><span>$150 professional upholstery cleaning.</span></button>' +
          '<button class="rp-option" onclick="rpSelectUpholstery(\'sofa\')"><strong>🛋️ Sofa</strong><span>$175 professional upholstery cleaning.</span></button>' +
          '<button class="rp-option featured-option" onclick="rpSelectUpholstery(\'sectional\')"><span class="badge">Popular</span><strong>🛋️ Sectional</strong><span>$250 for sectionals up to 5 seats.</span></button>' +
          '<button class="rp-option" onclick="rpSelectUpholstery(\'large_sectional\')"><strong>🛋️ Large Sectional</strong><span>$325 for 6+ seats or chaise setups.</span></button>' +
          '</div><div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button></div>';
        return;
      }

      if (rpState.step === 3 && ['deep','maintenance'].indexOf(rpState.service) >= 0) {
        app.innerHTML =
          '<h2>How many bedrooms?</h2><p class="rp-sub">This helps estimate the size of the home.</p>' +
          '<div class="rp-pill-grid">' + [1,2,3,4,5].map(function (n) { return '<button class="rp-pill" onclick="rpSelectBedrooms(' + n + ')">' + n + (n === 5 ? '+' : '') + '</button>'; }).join('') + '</div>' +
          '<div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button></div>';
        return;
      }

      if (rpState.step === 4 && (rpState.service === 'moveout' || rpState.service === 'movein')) {
        var moveIn = rpState.service === 'movein';
        app.innerHTML =
          '<h2>Add carpet or exterior windows?</h2>' +
          '<p class="rp-sub">Optional services can complete the reset. Skip anything you do not need.</p>' +
          '<div class="rp-choice-grid">' +
          '<label class="rp-checkbox-card"><input type="checkbox" ' + (rpState.carpetRooms > 0 ? 'checked' : '') + ' onchange="rpToggleCarpetUpsell(this.checked)"><div><strong>Carpet extraction cleaning</strong><span>Professional hot-water extraction.</span></div><div class="rp-price-chip">$75/room</div></label>' +
          '<div id="rpCarpetRoomPicker" style="' + (rpState.carpetRooms > 0 ? '' : 'display:none;') + '"><p class="rp-sub" style="margin:8px 0;">How many carpeted rooms?</p><div class="rp-pill-grid">' + [1,2,3,4,5,6].map(function (n) { return '<button class="rp-pill ' + (rpState.carpetRooms === n ? 'is-selected' : '') + '" onclick="rpSelectMoveoutCarpetRooms(' + n + ')">' + n + (n === 6 ? '+' : '') + '</button>'; }).join('') + '</div></div>' +
          '<label class="rp-checkbox-card"><input type="checkbox" ' + (rpState.exteriorWindows ? 'checked' : '') + ' onchange="rpToggleExteriorWindows(this.checked)"><div><strong>Exterior window basic wash</strong><span>Exterior glass only. No screen removal.</span></div><div class="rp-price-chip">+$100</div></label>' +
          '</div><div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button><button class="rp-primary" onclick="rpGoToEstimate()">See Estimate</button></div>';
        return;
      }

      if (rpState.step === 4 && ['deep','maintenance'].indexOf(rpState.service) >= 0) {
        app.innerHTML =
          '<h2>How many bathrooms?</h2><p class="rp-sub">Bathrooms adjust the estimate.</p>' +
          '<div class="rp-pill-grid">' + [1,2,3,4].map(function (n) { return '<button class="rp-pill" onclick="rpSelectBathrooms(' + n + ')">' + n + (n === 4 ? '+' : '') + '</button>'; }).join('') + '</div>' +
          '<div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button></div>';
        return;
      }

      if ((rpState.step === 4 && (rpState.service === 'carpet' || rpState.service === 'upholstery')) || rpState.step === 5) return renderEstimateStep();
      if (rpState.step === 6) return renderLeadStep();
      if (rpState.step === 7) return renderCalendarStep();
    }

    function renderEstimateStep() {
      var app = document.getElementById('rpApp');
      var total = calculatePrice();
      var serviceMap = getServiceMap();
      var service = serviceMap[rpState.service] || services[rpState.service] || { name: 'Cleaning' };
      app.innerHTML = livePrice('looks good. You can reserve your cleaning next.') +
        '<h2>Estimated Price</h2>' +
        (rpState.service === 'deep' ? '<div class="rp-choice-grid" style="margin-bottom:16px;"><p class="rp-tap-note" style="margin-bottom:2px;">Optional add-ons</p><label class="rp-checkbox-card"><input type="checkbox" ' + (rpState.carpetRooms > 0 ? 'checked' : '') + ' onchange="rpToggleCarpetUpsell(this.checked)"><div><strong>Carpet extraction cleaning</strong><span>Professional hot-water extraction.</span></div><div class="rp-price-chip">$75/room</div></label><div id="rpCarpetRoomPicker" style="' + (rpState.carpetRooms > 0 ? '' : 'display:none;') + '"><p class="rp-sub" style="margin:8px 0;">How many carpeted rooms?</p><div class="rp-pill-grid">' + [1,2,3,4,5,6].map(function (n) { return '<button class="rp-pill ' + (rpState.carpetRooms === n ? 'is-selected' : '') + '" onclick="rpSelectMoveoutCarpetRooms(' + n + ')">' + n + (n === 6 ? '+' : '') + '</button>'; }).join('') + '</div></div><label class="rp-checkbox-card"><input type="checkbox" ' + (rpState.exteriorWindows ? 'checked' : '') + ' onchange="rpToggleExteriorWindows(this.checked)"><div><strong>Exterior window basic wash</strong><span>Exterior glass only. No screen removal.</span></div><div class="rp-price-chip">+$100</div></label></div>' : '') +
        '<div class="rp-invoice">' +
        '<div class="rp-mini-row"><span>Service</span><strong>' + service.name + '</strong></div>' +
        '<div class="rp-mini-row"><span>Time / Crew</span><strong>' + serviceDuration(rpState.service) + '</strong></div>' +
        (rpState.bedrooms ? '<div class="rp-mini-row"><span>Bedrooms</span><strong>' + rpState.bedrooms + (rpState.bedrooms >= 5 ? '+' : '') + '</strong></div>' : '') +
        (rpState.bathrooms ? '<div class="rp-mini-row"><span>Bathrooms</span><strong>' + rpState.bathrooms + (rpState.bathrooms >= 4 ? '+' : '') + '</strong></div>' : '') +
        ((rpState.service === 'moveout' || rpState.service === 'movein') && rpState.bedrooms ? '<div class="rp-mini-row"><span>' + (rpState.service === 'movein' ? 'Factory Reset™ Move-In base' : 'Factory Reset™ Move-Out base') + '</span><strong>$' + (rpState.service === 'movein' ? moveinPrices : moveoutPrices)[Math.min(rpState.bedrooms, 4)] + '</strong></div>' : '') +
        (rpState.carpetRooms ? '<div class="rp-mini-row"><span>Carpet extraction cleaning</span><strong>' + rpState.carpetRooms + (rpState.carpetRooms >= 6 ? '+' : '') + ' room(s) · $' + (rpState.carpetRooms * 75) + '</strong></div>' : '') +
        (rpState.service === 'upholstery' && rpState.upholsteryLabel ? '<div class="rp-mini-row"><span>Furniture item</span><strong>' + rpState.upholsteryLabel + ' · $' + rpState.upholsteryPrice + '</strong></div>' : '') +
        (rpState.exteriorWindows ? '<div class="rp-mini-row"><span>Exterior window basic wash</span><strong>$100</strong></div>' : '') +
        '<div class="rp-total"><span>Estimated Price</span><span>$' + total + '</span></div></div>' +
        '<div class="rp-notice">Final price may change for severe mess, heavy trash, unusual access issues, biohazard conditions, or work beyond scope.</div>' +
        '<div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Edit</button><button class="rp-primary" onclick="rpGoToLead()">Continue To Contact & Time</button></div>' +
        '<p class="rp-fineprint">Prefer texting? Tap Text Us and send a screenshot of this estimate.</p>';
    }

    function renderLeadStep() {
      var app = document.getElementById('rpApp');
      app.innerHTML = livePrice('then choose your appointment time.') +
        '<h2>Almost Done</h2><p class="rp-sub">Enter your details so your booking has the right contact and property information. Then choose your appointment time.</p>' +
        '<div class="rp-lead-form">' +
        '<div class="rp-lead-field"><label for="rpFullName">Full Name *</label><input id="rpFullName" type="text" value="' + (rpState.fullName || '') + '" placeholder="Your full name"></div>' +
        '<div class="rp-lead-field"><label for="rpPhone">Phone Number *</label><input id="rpPhone" type="tel" value="' + (rpState.phone || '') + '" placeholder="(580) 000-0000"></div>' +
        '<div class="rp-lead-field"><label for="rpEmail">Email Address *</label><input id="rpEmail" type="email" value="' + (rpState.email || '') + '" placeholder="you@email.com"></div>' +
        '<div class="rp-lead-field"><label for="rpAddress1">Street Address *</label><input id="rpAddress1" type="text" value="' + (rpState.address1 || '') + '" placeholder="123 Main St"></div>' +
        '<div class="rp-lead-field"><label for="rpCity">City *</label><input id="rpCity" type="text" value="' + (rpState.city || '') + '" placeholder="Lawton"></div>' +
        '<div class="rp-lead-field"><label for="rpPostalCode">ZIP Code *</label><input id="rpPostalCode" type="text" value="' + (rpState.postalCode || '') + '" placeholder="73505" inputmode="numeric"></div>' +
        '<div class="rp-lead-field"><label for="rpSpecialInstructions">Access Notes / Special Instructions</label><textarea id="rpSpecialInstructions" placeholder="Gate code, lockbox, inspection date, pets, carpet notes, parking, or anything Christa should know">' + (rpState.specialInstructions || '') + '</textarea></div>' +
        '</div><div id="rpFormError" class="rp-error">Please enter your name, phone, email, street address, city, and ZIP code.</div>' +
        '<div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button><button id="rpReserveBtn" class="rp-primary" onclick="rpSubmitLeadAndShowCalendar()">Choose Appointment Time</button></div>' +
        '<p class="rp-fineprint">Next you will choose a calendar time. Confirmation messages should only send after your appointment time is booked.</p>';
    }

    function estimatePayload() {
      var total = calculatePrice();
      var serviceMap = getServiceMap();
      var service = (serviceMap[rpState.service] && serviceMap[rpState.service].name) || 'Not selected';
      var address1 = (rpState.address1 || '').trim();
      var city = (rpState.city || '').trim();
      var state = (rpState.state || 'OK').trim().toUpperCase();
      var postalCode = (rpState.postalCode || '').trim();
      var fullAddress = [address1, [city, state, postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      var notes = (rpState.specialInstructions || '').trim() || 'None';
      var jobDetails = [
        'Service: ' + service,
        'Estimate: $' + total,
        'Bedrooms: ' + (rpState.bedrooms || 'N/A'),
        'Bathrooms: ' + (rpState.bathrooms || 'N/A'),
        'Carpet rooms: ' + (rpState.carpetRooms || '0'),
        'Exterior windows: ' + (rpState.exteriorWindows ? 'Yes' : 'No'),
        'Upholstery item: ' + (rpState.upholsteryLabel || 'N/A'),
        'Address: ' + (fullAddress || 'N/A'),
        'Special instructions: ' + notes
      ].join(' | ');
      return {
        source: 'Red Prairie Website Instant Estimator', business: 'Red Prairie Cleaning', full_name: rpState.fullName,
        phone: rpState.phone, email: rpState.email, address1: address1, street_address: address1, address: address1,
        city: city, state: state, postal_code: postalCode, zip: postalCode, full_address: fullAddress,
        service: service, service_type: service, service_key: rpState.service, estimated_price: '$' + total,
        estimated_price_number: total, price_estimate: '$' + total, bedrooms: rpState.bedrooms || 'N/A',
        bathrooms: rpState.bathrooms || 'N/A', carpet_rooms: rpState.carpetRooms || '0',
        exterior_windows: rpState.exteriorWindows ? 'Yes' : 'No', upholstery_type: rpState.upholsteryType || 'N/A',
        upholstery_item: rpState.upholsteryLabel || 'N/A', upholstery_price: rpState.upholsteryPrice || '0',
        addons: [rpState.carpetRooms ? 'Carpet extraction cleaning: ' + rpState.carpetRooms + ' room(s)' : '', rpState.exteriorWindows ? 'Exterior window basic wash' : '', rpState.upholsteryLabel ? 'Upholstery: ' + rpState.upholsteryLabel : ''].filter(Boolean).join(', ') || 'None',
        special_instructions: notes, customer_notes: notes, estimate_notes: jobDetails, job_details: jobDetails,
        cleaner_notes: jobDetails, submitted_at: new Date().toISOString(), page_url: window.location.href
      };
    }

    function buildCalendarUrl() {
      var url = new URL(RP_CALENDAR_URL);
      var parts = (rpState.fullName || '').trim().split(/\s+/).filter(Boolean);
      var firstName = parts.shift() || '';
      var lastName = parts.join(' ');
      var total = calculatePrice();
      var payload = estimatePayload();
      var params = {
        first_name: firstName,
        last_name: lastName,
        name: rpState.fullName,
        email: rpState.email,
        phone: rpState.phone,
        address: rpState.address1,
        address1: rpState.address1,
        street_address: rpState.address1,
        city: rpState.city,
        state: 'OK',
        postal_code: rpState.postalCode,
        zip: rpState.postalCode,
        full_address: payload.full_address,
        service: payload.service,
        estimated_price: '$' + total,
        job_details: payload.job_details
      };
      Object.entries(params).forEach(function (entry) {
        if (entry[1]) url.searchParams.set(entry[0], entry[1]);
      });
      return url.toString();
    }

    function renderCalendarStep() {
      var app = document.getElementById('rpApp');
      app.innerHTML = livePrice('choose your appointment time below.') +
        '<h2>Reserve Your Cleaning Time</h2>' +
        '<p class="rp-sub">Choose your preferred date and time below. Your confirmation should only send after this calendar booking is completed.</p>' +
        '<div class="rp-booking-widget"><iframe src="' + buildCalendarUrl() + '" style="width:100%; border:none; overflow:hidden; min-height:760px;" scrolling="no" id="1VXLRmyHfLdsHa4rTKJ2_1781361516868" title="Red Prairie Cleaning booking calendar"></iframe></div>' +
        '<div class="rp-btns"><button class="rp-secondary" onclick="rpBack()">Back</button></div>';
      loadCalendarScript();
    }

    function loadCalendarScript() {
      if (document.getElementById('ghl-calendar-script')) return;
      var script = document.createElement('script');
      script.src = 'https://link.msgsndr.com/js/form_embed.js';
      script.type = 'text/javascript';
      script.id = 'ghl-calendar-script';
      document.body.appendChild(script);
    }

    function addCanonicalStyles() {
      if (document.getElementById('rp-canonical-estimator-style')) return;
      var style = document.createElement('style');
      style.id = 'rp-canonical-estimator-style';
      style.textContent = '.rp-checkbox-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;background:#fafafa;border:2px solid #ddd;border-radius:16px;padding:14px;cursor:pointer}.rp-checkbox-card input{width:20px;height:20px;accent-color:#d00000}.rp-checkbox-card strong{display:block;font-size:15px}.rp-checkbox-card span{display:block;color:#555;font-size:12px}.rp-price-chip{background:#fff0f0;color:#d00000;border:1px solid #f0caca;border-radius:999px;padding:6px 10px;font-weight:900;white-space:nowrap;font-size:13px}.rp-mini-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #eee;padding:10px 0;font-size:14px}.rp-mini-row strong{text-align:right}.rp-choice-grid{display:grid;gap:10px;margin:14px 0}.rp-live-price{background:#101010;color:#fff;border-radius:20px;padding:15px;margin:0 0 12px;box-shadow:0 16px 36px rgba(0,0,0,.18)}.rp-live-price small{display:block;color:#ddd;font-weight:900;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}.rp-live-price strong{display:block;color:#fff;font-size:clamp(40px,13vw,66px);line-height:.95;letter-spacing:-.05em}.rp-live-price span{display:block;color:#eee;font-size:13.5px;margin-top:9px}.rp-option{position:relative;padding-right:48px;border:2px solid #ddd}.rp-option::after{content:"›";position:absolute;right:17px;top:50%;transform:translateY(-50%);color:#d00000;font-size:34px;font-weight:900;line-height:1}.rp-option .badge{display:inline-flex;background:#d00000;color:#fff;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;margin-bottom:6px}.rp-pill.is-selected,.rp-option.is-selected{border-color:#d00000;background:#fff5f5}.rp-service-intro h2{margin-bottom:8px}.rp-checklist-list{list-style:none;margin:0;padding:0}.rp-duration-note{background:#f8f8f8;border:1px solid #e5e5e5;border-radius:14px;padding:12px 14px;font-size:13px;font-weight:800;color:#333;margin:12px 0}.rp-guarantee{display:grid;gap:4px;background:#fff5f5;border:1px solid #f0caca;border-radius:16px;padding:14px;margin:12px 0}.rp-guarantee strong{color:#b80000}.rp-guarantee span{color:#333;font-size:13px;line-height:1.45}';
      document.head.appendChild(style);
    }

    window.rpCalculatePrice = calculatePrice;
    window.rpPriceLabel = priceLabel;
    window.rpLivePrice = livePrice;
    window.rpRender = render;
    window.rpRenderEstimateStep = renderEstimateStep;
    window.rpRenderLeadStep = renderLeadStep;
    window.rpGetEstimatePayload = estimatePayload;
    window.rpBuildCalendarUrl = buildCalendarUrl;
    window.rpRenderCalendarStep = renderCalendarStep;
    window.rpLoadCalendarScript = loadCalendarScript;
    window.rpScrollToCalculator = scrollToCalculator;
    window.rpUpdateProgress = updateProgress;
    window.rpMaxSteps = maxSteps;

    window.rpSelectService = function (service) {
      patchState();
      rpState.service = service;
      rpState.step = 2;
      rpState.bedrooms = null;
      rpState.bathrooms = null;
      rpState.carpetRooms = 0;
      rpState.exteriorWindows = false;
      rpState.upholsteryType = null;
      rpState.upholsteryLabel = '';
      rpState.upholsteryPrice = 0;
      rpState.estimateSent = false;
      rpState.preBookingWebhookSent = false;
      render();
      scrollToCalculator();
    };
    window.rpContinueFromIncludes = function () { rpState.step = (rpState.service === 'airbnb' || rpState.service === 'commercial') ? 3 : 3; render(); scrollToCalculator(); };
    window.rpSelectBedrooms = function (n) { rpState.bedrooms = n; rpState.step = (rpState.service === 'moveout' || rpState.service === 'movein' || rpState.service === 'deep' || rpState.service === 'maintenance') ? 4 : 5; render(); scrollToCalculator(); };
    window.rpSelectBathrooms = function (n) { rpState.bathrooms = n; rpState.step = 5; render(); scrollToCalculator(); };
    window.rpSelectCarpetOnlyRooms = function (n) { rpState.carpetRooms = n; rpState.step = 4; render(); scrollToCalculator(); };
    window.rpSelectUpholstery = function (type) { var item = upholsteryPrices[type]; if (!item) return; rpState.upholsteryType = type; rpState.upholsteryLabel = item.label; rpState.upholsteryPrice = item.price; rpState.step = 4; render(); scrollToCalculator(); };
    window.rpToggleCarpetUpsell = function (checked) { rpState.carpetRooms = checked ? (Number(rpState.carpetRooms) || 1) : 0; render(); };
    window.rpSelectMoveoutCarpetRooms = function (n) { rpState.carpetRooms = n; render(); };
    window.rpToggleExteriorWindows = function (checked) { rpState.exteriorWindows = checked; render(); };
    window.rpGoToEstimate = function () { rpState.step = 5; render(); scrollToCalculator(); };
    window.rpGoToLead = function () { rpState.step = 6; render(); scrollToCalculator(); };
    window.rpBack = function () {
      if (rpState.step <= 1) return;
      if (rpState.step === 7) rpState.step = 6;
      else if (rpState.step === 6) rpState.step = (rpState.service === 'airbnb' || rpState.service === 'commercial') ? 3 : 5;
      else if (rpState.step === 5) {
        if (rpState.service === 'carpet' || rpState.service === 'upholstery') rpState.step = 3;
        else rpState.step = 4;
      }
      else if (rpState.step === 4) rpState.step = 3;
      else if (rpState.step === 3) rpState.step = 2;
      else if (rpState.step === 2) rpState.step = 1;
      render();
      scrollToCalculator();
    };
    window.rpSendEstimateToGoHighLevel = function () {
      rpState.estimateSent = true;
      rpState.preBookingWebhookSent = true;
      return true;
    };
    window.rpSubmitLeadAndShowCalendar = function () {
      var fullName = document.getElementById('rpFullName').value.trim();
      var phone = document.getElementById('rpPhone').value.trim();
      var email = document.getElementById('rpEmail').value.trim();
      var address1 = document.getElementById('rpAddress1').value.trim();
      var city = document.getElementById('rpCity').value.trim();
      var postalCode = document.getElementById('rpPostalCode').value.trim();
      var specialInstructions = document.getElementById('rpSpecialInstructions').value.trim();
      var errorBox = document.getElementById('rpFormError');
      var emailLooksValid = email.indexOf('@') > -1 && email.indexOf('.') > -1;
      if (!fullName || !phone || !emailLooksValid || !address1 || !city || !postalCode) {
        if (errorBox) errorBox.style.display = 'block';
        return;
      }
      rpState.fullName = fullName;
      rpState.phone = phone;
      rpState.email = email;
      rpState.address1 = address1;
      rpState.city = city;
      rpState.state = 'OK';
      rpState.postalCode = postalCode;
      rpState.specialInstructions = specialInstructions;
      window.rpSendEstimateToGoHighLevel();
      var button = document.getElementById('rpReserveBtn');
      if (button) { button.disabled = true; button.innerText = 'Opening calendar...'; }
      rpState.step = 7;
      render();
      scrollToCalculator();
    };

    addCanonicalStyles();
    patchState();
    render();
  });
})();