const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const DEFAULT_ORIGIN = "https://redprairiecleaning.com";
const APPOINTMENT_DURATION_HOURS = 4;

function getAllowedOrigins(env) {
  return new Set([
    env.ALLOWED_ORIGIN || DEFAULT_ORIGIN,
    "https://www.redprairiecleaning.com",
  ]);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = getAllowedOrigins(env);

  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : env.ALLOWED_ORIGIN || DEFAULT_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(request, env),
    },
  });
}

function ghlHeaders(env, includeJson = false) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${env.GHL_PRIVATE_TOKEN}`,
    Version: "2021-04-15",
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function missingEnvironmentVariables(env, names) {
  return names.filter((name) => !env[name]);
}

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}


function cleanObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function cleanFieldValue(value, maxLength = 5000) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanFieldValue(item, maxLength))
      .filter(Boolean)
      .join(", ")
      .slice(0, maxLength);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim().slice(0, maxLength);
}

function normalizeFieldKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^\{\{/, "")
    .replace(/\}\}$/, "")
    .replace(/^contact[._-]?/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeChoice(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function getPicklistOptions(field) {
  const raw = field?.picklistOptions || field?.options || field?.fieldOptions || [];
  if (!Array.isArray(raw)) return [];

  return raw
    .map((option) => {
      if (typeof option === "string" || typeof option === "number") {
        return String(option);
      }
      if (!option || typeof option !== "object") return "";
      return cleanFieldValue(
        option.value ?? option.label ?? option.name ?? option.text ?? "",
        300
      );
    })
    .filter(Boolean);
}

function serviceCandidates(serviceKey, serviceName, fieldKey) {
  const key = String(serviceKey || "").toLowerCase();
  const websiteName = cleanFieldValue(serviceName, 200);

  const legacyServiceNeeded = {
    moveout: "Move Out Cleaning",
    deep: "Deep Cleaning",
    maintenance: "Recurring Cleaning",
    carpet: "Carpet Cleaning",
    hourly: "Other",
    airbnb: "Other",
  };

  const aliases = {
    moveout: [
      "Factory Reset™ Move-Out Cleaning",
      "Factory Reset Move-Out Cleaning",
      "Move-Out Cleaning",
      "Move Out Cleaning",
    ],
    deep: ["Deep Cleaning"],
    maintenance: [
      "Maintenance Cleaning",
      "Recurring Cleaning",
      "House Cleaning",
      "Standard Cleaning",
    ],
    carpet: ["Carpet Cleaning", "Professional Steam Carpet Cleaning"],
    hourly: ["Hourly Cleaning", "Other"],
    airbnb: ["Airbnb Turnover Cleaning", "Airbnb Cleaning", "Other"],
  };

  const values = [];
  if (fieldKey === "service_needed" && legacyServiceNeeded[key]) {
    values.push(legacyServiceNeeded[key]);
  }
  if (websiteName) values.push(websiteName);
  if (aliases[key]) values.push(...aliases[key]);
  if (fieldKey !== "service_needed" && legacyServiceNeeded[key]) {
    values.push(legacyServiceNeeded[key]);
  }

  return [...new Set(values.filter(Boolean))];
}

function matchPicklistValue(field, candidates) {
  const options = getPicklistOptions(field);
  if (!options.length) return candidates[0] || "";

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeChoice(candidate);
    const exact = options.find(
      (option) => normalizeChoice(option) === normalizedCandidate
    );
    if (exact) return exact;
  }

  return "";
}

async function getContactCustomFields(env) {
  const ghlUrl = new URL(
    `https://services.leadconnectorhq.com/locations/${encodeURIComponent(
      env.GHL_LOCATION_ID
    )}/customFields`
  );
  ghlUrl.searchParams.set("model", "contact");

  const response = await fetch(ghlUrl, {
    method: "GET",
    headers: ghlHeaders(env),
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    const error = new Error(
      "Unable to read HighLevel contact custom fields. Check the private integration's custom-field read permission."
    );
    error.status = response.status;
    error.details = data;
    throw error;
  }

  const fields = Array.isArray(data?.customFields)
    ? data.customFields
    : Array.isArray(data?.fields)
      ? data.fields
      : Array.isArray(data)
        ? data
        : [];

  return fields.filter((field) => field && field.id);
}

function buildBookingFieldValues(body, service, estimate, notes) {
  const details = cleanObject(body.details);
  const estimateLabel = Number.isFinite(estimate)
    ? `$${estimate.toFixed(0)}`
    : cleanFieldValue(
        details.estimated_price || details.price_estimate || "Custom Quote",
        100
      );
  const specialInstructions = cleanFieldValue(
    details.special_instructions || body.specialInstructions || "None",
    3000
  );
  const fullJobDetails = cleanFieldValue(
    details.job_details || details.estimate_notes || notes,
    5000
  );
  const notesSummary = [
    details.condition && details.condition !== "N/A"
      ? `Condition: ${cleanFieldValue(details.condition, 80)}`
      : "",
    details.frequency && details.frequency !== "N/A"
      ? `Frequency: ${cleanFieldValue(details.frequency, 80)}`
      : "",
    details.addons && details.addons !== "None"
      ? `Add-ons: ${cleanFieldValue(details.addons, 180)}`
      : "",
    details.carpet_rooms && String(details.carpet_rooms) !== "0"
      ? `Carpet rooms: ${cleanFieldValue(details.carpet_rooms, 20)}`
      : "",
    details.laundry_loads && String(details.laundry_loads) !== "0"
      ? `Laundry loads: ${cleanFieldValue(details.laundry_loads, 20)}`
      : "",
    details.heavy_soil === "Yes" ? "Heavy soil: Yes" : "",
    details.pet_odor === "Yes" ? "Pet odor: Yes" : "",
    details.handyman_interest === "Yes" ? "Make-ready request: Yes" : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    special_instructions: specialInstructions,
    estimated_price: estimateLabel,
    service_type: cleanFieldValue(details.service_type || service, 200),
    service_needed: cleanFieldValue(details.service || service, 200),
    bathrooms: cleanFieldValue(details.bathrooms || body.bathrooms || "N/A", 50),
    bedrooms: cleanFieldValue(details.bedrooms || body.bedrooms || "N/A", 50),
    notes: cleanFieldValue(notesSummary || fullJobDetails, 500),
    booking_details: fullJobDetails,
    service_key: cleanFieldValue(details.service_key || body.serviceKey, 80),
  };
}

function mapKnownContactCustomFields(catalog, values) {
  const definitions = {
    special_instructions: { maxLength: 3000 },
    estimated_price: { maxLength: 100 },
    service_type: { dropdown: true, maxLength: 200 },
    service_needed: { dropdown: true, maxLength: 200 },
    bathrooms: { maxLength: 50 },
    bedrooms: { maxLength: 50 },
    notes: { maxLength: 5000 },
    booking_details: { maxLength: 5000 },
  };

  const customFields = [];
  const mapped = [];
  const skipped = [];

  for (const [targetKey, definition] of Object.entries(definitions)) {
    const field = catalog.find((candidate) => {
      const keys = [
        candidate?.fieldKey,
        candidate?.key,
        String(candidate?.fieldKey || candidate?.key || "").split(".").pop(),
        candidate?.name,
      ]
        .map(normalizeFieldKey)
        .filter(Boolean);
      return keys.includes(normalizeFieldKey(targetKey));
    });

    if (!field) {
      skipped.push({ field: targetKey, reason: "not_found" });
      continue;
    }

    let fieldValue = cleanFieldValue(values[targetKey], definition.maxLength);
    if (!fieldValue) {
      skipped.push({ field: targetKey, reason: "empty" });
      continue;
    }

    if (definition.dropdown) {
      fieldValue = matchPicklistValue(
        field,
        serviceCandidates(values.service_key, fieldValue, targetKey)
      );
      if (!fieldValue) {
        skipped.push({ field: targetKey, reason: "no_matching_dropdown_option" });
        continue;
      }
    }

    customFields.push({
      id: field.id,
      value: fieldValue,
      kind: definition.dropdown ? "dropdown" : "text",
    });
    mapped.push({
      id: field.id,
      field: field.name || targetKey,
      fieldKey: field.fieldKey || field.key || `contact.${targetKey}`,
      value: fieldValue,
      kind: definition.dropdown ? "dropdown" : "text",
    });
  }

  return { customFields, mapped, skipped };
}

function serializeCustomFields(fields, format = "snake") {
  return fields.map((field) =>
    format === "camel"
      ? { id: field.id, fieldValue: field.value }
      : { id: field.id, field_value: field.value }
  );
}

async function upsertContact(env, baseContactPayload, fields = [], format = "snake") {
  const response = await fetch(
    "https://services.leadconnectorhq.com/contacts/upsert",
    {
      method: "POST",
      headers: ghlHeaders(env, true),
      body: JSON.stringify({
        ...baseContactPayload,
        ...(fields.length
          ? { customFields: serializeCustomFields(fields, format) }
          : {}),
      }),
    }
  );

  return {
    response,
    data: await readJsonResponse(response),
    fields,
    format: fields.length ? format : "none",
  };
}

function normalizePhone(value) {
  return cleanString(value, 30).replace(/[^\d+]/g, "");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function addHours(isoDate, hours) {
  const date = new Date(isoDate);
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date.toISOString();
}

async function getFreeSlots(env, start, end) {
  const ghlUrl = new URL(
    `https://services.leadconnectorhq.com/calendars/${encodeURIComponent(
      env.GHL_CALENDAR_ID
    )}/free-slots`
  );

  ghlUrl.searchParams.set("startDate", String(start));
  ghlUrl.searchParams.set("endDate", String(end));
  ghlUrl.searchParams.set(
    "timezone",
    env.GHL_TIMEZONE || "America/Chicago"
  );

  const response = await fetch(ghlUrl, {
    method: "GET",
    headers: ghlHeaders(env),
  });

  return {
    response,
    data: await readJsonResponse(response),
  };
}

function slotExists(freeSlots, selectedStartTime) {
  if (!freeSlots || typeof freeSlots !== "object") return false;

  return Object.values(freeSlots).some((day) => {
    if (!day || !Array.isArray(day.slots)) return false;

    return day.slots.some((slot) => {
      return new Date(slot).getTime() === new Date(selectedStartTime).getTime();
    });
  });
}

function extractAppointmentId(appointmentData) {
  return (
    appointmentData?.id ||
    appointmentData?.appointment?.id ||
    appointmentData?.calendar?.id ||
    ""
  );
}

async function createAppointmentNote(env, appointmentId, noteBody) {
  const trimmedBody = cleanString(noteBody, 5000);
  if (!appointmentId || !trimmedBody) {
    return { ok: false, skipped: true };
  }

  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/calendars/appointments/${encodeURIComponent(
        appointmentId
      )}/notes`,
      {
        method: "POST",
        headers: ghlHeaders(env, true),
        body: JSON.stringify({ body: trimmedBody }),
      }
    );
    const data = await readJsonResponse(response);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}


/* =========================================================================
   ROUND 68 — MARKETING TAGS + READABLE NOTES
   ========================================================================= */

// Only these two tags are ever auto-applied, and only to CONFIRMED bookings.
//   recurring-clean : Basic (any cadence), Deep, Whole-Home Reset
//   move-out        : Move-Out Cleaning
const RECURRING_CLEAN_SERVICE_KEYS = ["maintenance", "deep", "reset"];
const ALLOWED_BOOKING_TAGS = ["recurring-clean", "move-out"];

function bookingTagsFor(body) {
  const details = cleanObject(body.details);
  // Prefer the tags the site computed, but only the allowed two, so an old
  // cached page sending retired tags (basic-clean etc.) can't apply them.
  const sent = Array.isArray(details.tags) ? details.tags : [];
  const fromSite = sent.filter((t) => ALLOWED_BOOKING_TAGS.includes(t));
  if (fromSite.length) return [...new Set(fromSite)];
  // Fallback: derive from the service key, so tagging works even if the
  // page that made the booking is an older cached copy.
  const key = String(details.service_key || body.serviceKey || "").toLowerCase();
  if (RECURRING_CLEAN_SERVICE_KEYS.includes(key)) return ["recurring-clean"];
  if (key === "moveout") return ["move-out"];
  return [];
}

// Add Tags endpoint ADDS to the contact's existing tags (never replaces).
// Never throws: a tag failure must not affect a booking that already exists.
async function addContactTags(env, contactId, tags) {
  if (!contactId || !tags.length) return { ok: true, skipped: true, tags: [] };
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/tags`,
      {
        method: "POST",
        headers: { ...ghlHeaders(env, true), Version: "2021-07-28" },
        body: JSON.stringify({ tags }),
      }
    );
    const data = await readJsonResponse(response);
    return { ok: response.ok, status: response.status, tags, data: response.ok ? undefined : data };
  } catch (error) {
    return { ok: false, tags, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// The site sends job details as one long "Label: value | Label: value" line
// (/book) or newline-separated lines (/call), with lots of N/A filler.
// This turns either into short labelled sections, drops empty values, and
// puts warnings at the top. Nothing with a real value is dropped: anything
// that doesn't fit a section lands under OTHER.
const EMPTY_NOTE_VALUE = /^(n\/a|none|none flagged|no|0|\$0(\.00)?|not provided|not asked|undefined|null)$/i;
const NOTE_SECTIONS = [
  ["PRICE", /^(estimate|quote|pricing status|base service price|condition flag|monthly billing|hourly rate|add-ons total|crew pay)\b/i],
  ["HOME", /^(address|service area|square footage|bedrooms|bathrooms|condition|pre-clean check|rental or selling|property manager)/i],
  ["JOB", /^(service|frequency|move-out cleaning|cleaners|hours|carpet rooms|laundry loads|heavy soil|pet odor|airbnb|add-ons|additional service)/i],
  ["CUSTOMER NOTES", /^(special instructions|access\/instructions|call notes|notes)\b/i],
  ["SOURCE", /^(ad attribution|lead source|booked by|source)\b/i],
];

function formatBookingNote({ blob, service, estimate, startTime, timezone, name, phone, email, address, frequency, channel }) {
  const lines = String(blob || "")
    .split(/\n| \| /)
    .map((l) => l.trim())
    .filter(Boolean);

  const warnings = [];
  const buckets = Object.fromEntries(NOTE_SECTIONS.map(([n]) => [n, []]));
  const other = [];

  for (const line of lines) {
    if (/^(⚠|!)/.test(line) || /CREW PREP|SERVICE AREA:/.test(line)) {
      warnings.push(
        line
          .replace(/^property conditions:\s*/i, "")
          .replace(/⚠\s*/g, "")
          .replace(/^CREW PREP:\s*/i, "Crew prep: ")
          .replace(/^SERVICE AREA:\s*/i, "Service area: ")
      );
      continue;
    }
    if (/^BOOKED BY PHONE/i.test(line)) continue; // shown in the header
    const m = line.match(/^([^:]{1,60}):\s*(.*)$/);
    if (m && EMPTY_NOTE_VALUE.test(m[2].trim())) continue;
    const headerShowsPrice = Number.isFinite(estimate) && estimate > 0;
    const inHeader = headerShowsPrice ? /^(service|address|estimate|quote|frequency)$/i : /^(service|address|frequency)$/i;
    if (m && inHeader.test(m[1].trim())) continue; // already in the header
    const section = NOTE_SECTIONS.find(([, re]) => re.test(line));
    (section ? buckets[section[0]] : other).push(line);
  }

  let when = startTime;
  try {
    when = new Date(startTime).toLocaleString("en-US", {
      timeZone: timezone, weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { /* keep ISO */ }

  const header = [
    `${String(service || "Cleaning").toUpperCase()}${Number.isFinite(estimate) && estimate > 0 ? ` — $${estimate.toFixed(0)}` : ""}`,
    `When: ${when}`,
    `Customer: ${[name, phone, email].filter(Boolean).join(" · ")}`,
    `Address: ${address}`,
    frequency && !EMPTY_NOTE_VALUE.test(frequency) && !/^one-time/i.test(frequency) ? `Recurring: ${frequency}` : "",
    channel ? `Booked via: ${channel}` : "",
  ].filter(Boolean);

  const out = [...header];
  if (warnings.length) out.push("", "⚠ HEADS UP", ...warnings.map((w) => `• ${w}`));
  for (const [n] of NOTE_SECTIONS) {
    if (buckets[n].length) out.push("", n, ...buckets[n].map((l) => `• ${l}`));
  }
  if (other.length) out.push("", "OTHER", ...other.map((l) => `• ${l}`));
  return out.join("\n").slice(0, 5000);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json(request, env, {
        ok: true,
        service: "Red Prairie Booking API",
        timezone: env.GHL_TIMEZONE || "America/Chicago",
        calendarConfigured: Boolean(env.GHL_CALENDAR_ID),
        bookingConfigured: Boolean(env.GHL_ASSIGNED_USER_ID),
      });
    }

    if (url.pathname === "/calendars" && request.method === "GET") {
      const missing = missingEnvironmentVariables(env, [
        "GHL_PRIVATE_TOKEN",
        "GHL_LOCATION_ID",
      ]);

      if (missing.length) {
        return json(
          request,
          env,
          { ok: false, error: "Missing required Cloudflare variables.", missing },
          500
        );
      }

      const ghlUrl = new URL("https://services.leadconnectorhq.com/calendars/");
      ghlUrl.searchParams.set("locationId", env.GHL_LOCATION_ID);

      try {
        const response = await fetch(ghlUrl, { method: "GET", headers: ghlHeaders(env) });
        const data = await readJsonResponse(response);
        return json(request, env, { ok: response.ok, status: response.status, data }, response.ok ? 200 : response.status);
      } catch (error) {
        return json(request, env, { ok: false, error: "Unable to contact HighLevel.", details: error instanceof Error ? error.message : "Unknown error" }, 502);
      }
    }

    if (url.pathname === "/slots" && request.method === "GET") {
      const missing = missingEnvironmentVariables(env, ["GHL_PRIVATE_TOKEN", "GHL_CALENDAR_ID"]);
      if (missing.length) {
        return json(request, env, { ok: false, error: "Missing required Cloudflare variables.", missing }, 500);
      }

      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      if (!start || !end) {
        return json(request, env, { ok: false, error: "Both start and end dates are required." }, 400);
      }

      const startTimestamp = Date.parse(`${start}T00:00:00`);
      const endTimestamp = Date.parse(`${end}T23:59:59`);

      if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp) || endTimestamp <= startTimestamp) {
        return json(request, env, { ok: false, error: "Invalid date range." }, 400);
      }

      try {
        const result = await getFreeSlots(env, startTimestamp, endTimestamp);
        return json(request, env, {
          ok: result.response.ok,
          status: result.response.status,
          calendarId: env.GHL_CALENDAR_ID,
          timezone: env.GHL_TIMEZONE || "America/Chicago",
          requestedRange: { start, end },
          data: result.data,
        }, result.response.ok ? 200 : result.response.status);
      } catch (error) {
        return json(request, env, { ok: false, error: "Unable to retrieve availability.", details: error instanceof Error ? error.message : "Unknown error" }, 502);
      }
    }

    if (url.pathname === "/book" && request.method === "POST") {
      const origin = request.headers.get("Origin");
      const allowedOrigins = getAllowedOrigins(env);

      if (origin && !allowedOrigins.has(origin)) {
        return json(request, env, { ok: false, error: "Origin not allowed." }, 403);
      }

      const missing = missingEnvironmentVariables(env, [
        "GHL_PRIVATE_TOKEN", "GHL_LOCATION_ID", "GHL_CALENDAR_ID", "GHL_ASSIGNED_USER_ID",
      ]);
      if (missing.length) {
        return json(request, env, { ok: false, error: "Missing required Cloudflare variables.", missing }, 500);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json(request, env, { ok: false, error: "Request body must be valid JSON." }, 400);
      }

      if (body.companyWebsite) {
        return json(request, env, { ok: true }, 200);
      }

      const firstName = cleanString(body.firstName, 80);
      const lastName = cleanString(body.lastName, 80);
      const email = cleanString(body.email, 160).toLowerCase();
      const phone = normalizePhone(body.phone);
      const address1 = cleanString(body.address1, 180);
      const city = cleanString(body.city || "Lawton", 80);
      const state = cleanString(body.state || "OK", 20);
      const postalCode = cleanString(body.postalCode, 20);
      const startTime = cleanString(body.startTime, 80);
      const service = cleanString(body.service || "Cleaning", 160);
      const estimate = Number(body.estimate);
      const notes = cleanString(body.notes, 5000);
      const dryRun = body.dryRun === true;
      const fieldValues = buildBookingFieldValues(body, service, estimate, notes);

      const errors = [];
      if (!firstName) errors.push("First name is required.");
      if (!lastName) errors.push("Last name is required.");
      if (!validEmail(email)) errors.push("A valid email is required.");
      if (phone.length < 10) errors.push("A valid phone number is required.");
      if (!address1) errors.push("Service address is required.");
      if (!startTime || Number.isNaN(Date.parse(startTime))) {
        errors.push("A valid appointment start time is required.");
      }
      if (errors.length) {
        return json(request, env, { ok: false, error: "Please correct the booking information.", fields: errors }, 400);
      }

      const startDate = new Date(startTime);
      if (startDate.getTime() <= Date.now()) {
        return json(request, env, { ok: false, error: "That appointment time has already passed." }, 400);
      }

      const rangeStart = new Date(startDate);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(startDate);
      rangeEnd.setHours(23, 59, 59, 999);

      let availabilityResult;
      try {
        availabilityResult = await getFreeSlots(env, rangeStart.getTime(), rangeEnd.getTime());
      } catch (error) {
        return json(request, env, { ok: false, error: "Unable to verify that appointment time." }, 502);
      }

      if (!availabilityResult.response.ok) {
        return json(request, env, { ok: false, error: "HighLevel could not verify availability.", details: availabilityResult.data }, availabilityResult.response.status);
      }

      if (!slotExists(availabilityResult.data, startTime)) {
        return json(request, env, { ok: false, error: "That time is no longer available. Please choose another time." }, 409);
      }

      const endTime = addHours(startTime, APPOINTMENT_DURATION_HOURS);
      const appointmentTitle = `Red Prairie Cleaning - ${firstName} ${lastName}`;

      const appointmentNotesFallback = [
        `Service: ${service}`,
        Number.isFinite(estimate) ? `Estimate: $${estimate.toFixed(0)}` : "",
        `Address: ${address1}, ${city}, ${state} ${postalCode}`,
        notes ? `Details: ${notes}` : "",
        "Booked through redprairiecleaning.com/book",
      ].filter(Boolean).join("\n").slice(0, 5000);

      const bookingDetailsObj = cleanObject(body.details);
      const readableNote = formatBookingNote({
        blob: notes || cleanFieldValue(bookingDetailsObj.job_details, 5000),
        service,
        estimate,
        startTime,
        timezone: env.GHL_TIMEZONE || "America/Chicago",
        name: `${firstName} ${lastName}`,
        phone,
        email,
        address: `${address1}, ${city}, ${state} ${postalCode}`,
        frequency: cleanFieldValue(bookingDetailsObj.frequency, 80),
        channel: bookingDetailsObj.booking_channel === "phone_csr"
          ? `Phone${bookingDetailsObj.csr_name ? ` (${cleanFieldValue(bookingDetailsObj.csr_name, 80)})` : ""}`
          : "Website",
      });
      // Round 68: the note and the contact's booking_details field get the
      // readable version instead of the raw one-line blob.
      // The appointment description keeps a full safety copy (as v28 did), in
      // case the separate note below fails to attach.
      const appointmentNotes = readableNote || appointmentNotesFallback;
      const fullAppointmentNoteBody = readableNote || notes || appointmentNotesFallback;
      fieldValues.booking_details = readableNote || fieldValues.booking_details;
      const bookingTags = bookingTagsFor(body);

      let customFieldMapping = { customFields: [], mapped: [], skipped: [] };
      let customFieldWarning = "";
      try {
        const customFieldCatalog = await getContactCustomFields(env);
        customFieldMapping = mapKnownContactCustomFields(customFieldCatalog, fieldValues);
      } catch (error) {
        customFieldWarning = error instanceof Error ? error.message : "Unable to map HighLevel custom fields.";
      }

      if (dryRun) {
        return json(request, env, {
          ok: true,
          dryRun: true,
          message: "Booking information and live availability were validated. No contact or appointment was created.",
          bookingPreview: {
            name: `${firstName} ${lastName}`,
            email, phone, service,
            estimate: Number.isFinite(estimate) ? estimate : null,
            startTime, endTime,
            address: `${address1}, ${city}, ${state} ${postalCode}`,
            appointmentStatus: "confirmed",
          },
          customFieldMapping: { mapped: customFieldMapping.mapped, skipped: customFieldMapping.skipped, warning: customFieldWarning || null },
          tagsWouldApply: bookingTags,
          notePreview: readableNote,
        });
      }

      const baseContactPayload = {
        locationId: env.GHL_LOCATION_ID,
        firstName, lastName,
        name: `${firstName} ${lastName}`,
        email, phone, address1, city, state, postalCode,
        source: "Red Prairie Website Booking",
      };

      const allCustomFields = customFieldMapping.customFields;
      const textCustomFields = allCustomFields.filter((field) => field.kind !== "dropdown");
      const attempts = [];

      if (allCustomFields.length) {
        attempts.push({ fields: allCustomFields, format: "snake" });
        attempts.push({ fields: allCustomFields, format: "camel" });
      }
      if (textCustomFields.length && textCustomFields.length !== allCustomFields.length) {
        attempts.push({ fields: textCustomFields, format: "snake" });
        attempts.push({ fields: textCustomFields, format: "camel" });
      }
      attempts.push({ fields: [], format: "none" });

      let contactResult = null;
      const contactAttemptErrors = [];
      for (const attempt of attempts) {
        const result = await upsertContact(env, baseContactPayload, attempt.fields, attempt.format);
        contactResult = result;
        if (result.response.ok) break;
        contactAttemptErrors.push({ status: result.response.status, format: result.format, fieldCount: result.fields.length, details: result.data });
      }

      const contactResponse = contactResult.response;
      const contactData = contactResult.data;
      const appliedFieldIds = new Set((contactResult.fields || []).map((field) => field.id));
      const appliedCustomFields = customFieldMapping.mapped.filter((field) => appliedFieldIds.has(field.id));

      if (customFieldMapping.customFields.length && appliedCustomFields.length < customFieldMapping.mapped.length) {
        customFieldWarning = appliedCustomFields.length
          ? "Some dropdown custom fields were skipped or rejected; the other contact fields were saved and all job details remain in the appointment notes."
          : "HighLevel did not accept the custom fields; the contact and appointment were still created and all job details remain in the appointment notes.";
      }

      if (!contactResponse.ok) {
        return json(request, env, { ok: false, error: "Unable to create or update the customer.", details: contactData }, contactResponse.status);
      }

      const contactId = contactData?.contact?.id || contactData?.contactId || contactData?.id;
      if (!contactId) {
        return json(request, env, { ok: false, error: "HighLevel created the customer but did not return a contact ID.", details: contactData }, 502);
      }

      const appointmentResponse = await fetch(
        "https://services.leadconnectorhq.com/calendars/events/appointments",
        {
          method: "POST",
          headers: ghlHeaders(env, true),
          body: JSON.stringify({
            calendarId: env.GHL_CALENDAR_ID,
            locationId: env.GHL_LOCATION_ID,
            contactId,
            assignedUserId: env.GHL_ASSIGNED_USER_ID,
            startTime, endTime,
            title: appointmentTitle,
            appointmentStatus: "confirmed",
            address: `${address1}, ${city}, ${state} ${postalCode}`,
            notes: appointmentNotes,
            ignoreDateRange: false,
            toNotify: true,
          }),
        }
      );

      const appointmentData = await readJsonResponse(appointmentResponse);

      if (!appointmentResponse.ok) {
        return json(request, env, { ok: false, error: "The customer was saved, but the appointment could not be created.", contactId, details: appointmentData }, appointmentResponse.status);
      }

      // Round 68: the appointment exists, so this is a confirmed booking.
      const tagResult = await addContactTags(env, contactId, bookingTags);

      const appointmentId = extractAppointmentId(appointmentData);
      let appointmentNoteWarning = "";

      const noteResult = await createAppointmentNote(env, appointmentId, fullAppointmentNoteBody);

      if (!appointmentId) {
        appointmentNoteWarning = "Appointment was booked, but no appointment ID was returned by HighLevel, so the detailed note could not be attached.";
      } else if (!noteResult.ok && !noteResult.skipped) {
        appointmentNoteWarning = "Appointment was booked, but the detailed note could not be attached. Full details are still saved on the contact record.";
      }

      return json(request, env, {
        ok: true,
        message: "Your cleaning appointment is confirmed.",
        contactId,
        appointment: appointmentData?.calendar || appointmentData?.appointment || appointmentData,
        appointmentNote: { attached: Boolean(noteResult.ok), warning: appointmentNoteWarning || null },
        customFieldMapping: {
          mappedCount: appliedCustomFields.length,
          mapped: appliedCustomFields,
          skipped: customFieldMapping.skipped,
          format: contactResult.format,
          warning: customFieldWarning || null,
        },
        tags: { applied: tagResult.ok ? tagResult.tags : [], warning: tagResult.ok ? null : "Booking saved, but tags could not be added." },
        redirectUrl: "https://redprairiecleaning.com/booking-confirmation.html",
      });
    }

    if (url.pathname === "/lead" && request.method === "POST") {
      const leadOrigin = request.headers.get("Origin");
      const leadAllowedOrigins = getAllowedOrigins(env);

      if (leadOrigin && !leadAllowedOrigins.has(leadOrigin)) {
        return json(request, env, { ok: false, error: "Origin not allowed." }, 403);
      }

      const leadMissing = missingEnvironmentVariables(env, ["GHL_PRIVATE_TOKEN", "GHL_LOCATION_ID"]);
      if (leadMissing.length) {
        return json(request, env, { ok: false, error: "Missing required Cloudflare variables.", missing: leadMissing }, 500);
      }

      let leadBody;
      try {
        leadBody = await request.json();
      } catch {
        return json(request, env, { ok: false, error: "Request body must be valid JSON." }, 400);
      }

      const leadFullName = cleanString(leadBody.full_name, 160);
      const leadNameParts = leadFullName.split(/\s+/).filter(Boolean);
      const leadFirstName = leadNameParts[0] || "Caller";
      const leadLastName = leadNameParts.slice(1).join(" ") || "(phone lead)";
      const leadEmail = cleanString(leadBody.email, 160).toLowerCase();
      const leadPhone = normalizePhone(leadBody.phone);
      const leadOutcome = cleanString(leadBody.call_outcome, 80) || "Unspecified";
      const leadSourceValue = cleanString(leadBody.csr_lead_source, 100) || "N/A";
      const leadCsrName = cleanString(leadBody.csr_name, 80);
      const leadService = cleanString(leadBody.service, 160) || "Not selected";
      const leadQuoted = cleanString(leadBody.quoted_price, 100) || "No quote given";
      const leadFullNotes = cleanString(leadBody.details, 5000);
      const leadSubmittedAt = cleanString(leadBody.submitted_at, 60) || new Date().toISOString();

      // Website partial leads (the /book contact gate) and phone leads (the
      // /call console) both land here. Defaults to phone so existing /call
      // posts, which don't send lead_type, are completely unaffected.
      const leadType = cleanString(leadBody.lead_type, 40) === "website_partial" ? "website_partial" : "phone_csr";
      const isWebsitePartial = leadType === "website_partial";

      if (leadPhone.length < 10) {
        return json(request, env, { ok: false, error: "A valid phone number is required to save the lead." }, 400);
      }
      if (leadEmail && !validEmail(leadEmail)) {
        return json(request, env, { ok: false, error: "Email address is invalid." }, 400);
      }

      const leadNoteBody = [
        isWebsitePartial ? `\u{1F5A5} WEBSITE LEAD — SAW PRICE, DID NOT BOOK` : `☎ PHONE LEAD — NO BOOKING`,
        `Outcome: ${leadOutcome}`,
        leadCsrName ? `Taken by: ${leadCsrName}` : "",
        `Service discussed: ${leadService}`,
        `Quote given: ${leadQuoted}`,
        `Lead source: ${leadSourceValue}`,
        `Logged: ${leadSubmittedAt}`,
        "",
        leadFullNotes,
      ].filter(Boolean).join("\n").slice(0, 5000);

      let leadCustomFieldMapping = { customFields: [], mapped: [], skipped: [] };
      let leadCustomFieldWarning = "";
      try {
        const leadCustomFieldCatalog = await getContactCustomFields(env);
        leadCustomFieldMapping = mapKnownContactCustomFields(leadCustomFieldCatalog, {
          special_instructions: "",
          estimated_price: leadQuoted,
          service_type: leadService,
          service_needed: leadService,
          service_key: "",
          bathrooms: "N/A",
          bedrooms: "N/A",
          notes: `${leadOutcome} — ${leadSourceValue}`,
          booking_details: leadNoteBody,
        });
      } catch (error) {
        leadCustomFieldWarning = error instanceof Error ? error.message : "Unable to map HighLevel custom fields.";
      }

      const leadContactPayload = {
        locationId: env.GHL_LOCATION_ID,
        firstName: leadFirstName,
        lastName: leadLastName,
        name: leadFullName || `${leadFirstName} ${leadLastName}`,
        ...(leadEmail ? { email: leadEmail } : {}),
        phone: leadPhone,
        source: isWebsitePartial ? "Red Prairie Website (price viewed, no booking)" : "RPC Call Console (no booking)",
        tags: isWebsitePartial
          ? ["website-partial-lead", "price-viewed-no-booking"]
          : ["call-no-booking", `outcome-${leadOutcome.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`],
      };

      let leadContactResult = await upsertContact(env, leadContactPayload, leadCustomFieldMapping.customFields, "snake");
      if (!leadContactResult.response.ok && leadCustomFieldMapping.customFields.length) {
        leadContactResult = await upsertContact(env, leadContactPayload, [], "none");
      }

      if (!leadContactResult.response.ok) {
        return json(request, env, { ok: false, error: "HighLevel rejected the lead.", details: leadContactResult.data }, leadContactResult.response.status);
      }

      const leadContactId = leadContactResult.data?.contact?.id || leadContactResult.data?.contactId || leadContactResult.data?.id;

      let leadNoteWarning = "";
      if (leadContactId) {
        try {
          const leadNoteResponse = await fetch(
            `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(leadContactId)}/notes`,
            { method: "POST", headers: ghlHeaders(env, true), body: JSON.stringify({ body: leadNoteBody }) }
          );
          if (!leadNoteResponse.ok) {
            leadNoteWarning = "Lead was saved, but the detailed note could not be attached.";
          }
        } catch {
          leadNoteWarning = "Lead was saved, but the detailed note could not be attached.";
        }
      }

      return json(request, env, {
        ok: true,
        message: "Lead saved.",
        contactId: leadContactId || null,
        outcome: leadOutcome,
        leadType,
        customFieldMapping: { mapped: leadCustomFieldMapping.mapped, skipped: leadCustomFieldMapping.skipped, warning: leadCustomFieldWarning || null },
        noteWarning: leadNoteWarning || null,
      });
    }

    return json(request, env, { ok: false, error: "Endpoint not found." }, 404);
  },
};
