# Marketing tags → HighLevel (Round 68)

## The two tags

| Tag | Applied to a CONFIRMED booking of |
|---|---|
| `recurring-clean` | Basic (one-time or scheduled), Deep, Whole-Home Reset |
| `move-out` | Move-Out Cleaning |

Carpet-only, car-detail-only and hourly bookings get no tag. Leads that did
not book (contact gate, saved quote, blocked move-out, /call lost calls) get
**no** tag — they send `tags: []` and put what they looked at in the plain
field `interest_tags_csv`.

The old `basic-clean` / `deep-clean` / `basic-detail` / `deep-detail` tags are
retired. They never reached any contact because the Worker never applied them.

## Why nobody was tagged: the Worker ignored `tags`

The site put the tags inside `body.details.tags` on every booking, but the
Worker never read them. **Fixed in `red-prairie-booking-worker-v32.js`**, a
drop-in replacement for v28:

- **Tags:** after the appointment is created (so only confirmed bookings get
  them), calls HighLevel's Add Tags endpoint. That call adds to the
  contact's existing tags and never replaces them. Only `recurring-clean`
  and `move-out` can be applied. If the site sends nothing usable (for
  example, an old cached page), the Worker works the tag out from the
  service key. A tag failure never fails a booking.
- **Readable notes:** the appointment note and the contact's Booking Details
  field become a short header (service and price, date/time, customer,
  address, recurring cadence, website or phone), a HEADS UP block for crew
  prep and service-area warnings, then PRICE / HOME / JOB / CUSTOMER NOTES /
  SOURCE sections. Empty N/A/None/No/0 lines are dropped. The appointment's
  own description is now four short lines instead of repeating the whole blob.
- **Clears the "didn't book" tags (v30):** the /book name/phone screen saves
  a lead before the booking exists, tagged `website-partial-lead` and
  `price-viewed-no-booking`. A confirmed booking now removes those two and
  `call-no-booking`, so your callback list only holds people who really
  didn't book. Past bookings keep them until you clean them up in GHL.
- **`/lead` is unchanged**, byte for byte in behaviour (tested).
- **Dry run** (`dryRun: true`) now also returns `tagsWouldApply` and
  `notePreview`, so you can see both without creating anything.

### Deploy

Cloudflare dashboard → Workers → `rpc-booking-api` → Edit code → select all,
paste v32, Deploy. No variables change. Then book one test Deep Cleaning and
check that the contact has `recurring-clean` and the appointment note is
tidy. Delete the test afterwards.

To roll back: paste v28 back in and deploy.

## Campaigns

| Segment | Use |
|---|---|
| `recurring-clean` | Remarket: "put it on a schedule", reminders, add-ons, referrals. Filter the `frequency` custom field to Weekly/Biweekly/Monthly to exclude people already on a plan |
| `move-out` | Suppression list: exclude from everything, they've left the address |

## Backfilling existing customers (Worker v31)

v31 adds a one-time page that tags past customers from the GHL calendar.

1. Cloudflare → Workers → `rpc-booking-api` → Settings → Variables and
   Secrets → add a **Secret** named `BACKFILL_KEY` with any long password.
2. Open
   `https://rpc-booking-api.aged-breeze-c9a5.workers.dev/backfill-tags?key=YOUR_KEY&since=2024-01-01`
   (set `since` to before your first booking). This is a preview and
   changes nothing.
3. Check the table, then click **Apply next 12** until it says All done.
   Click "Also remove didn't-book tags" first if you want those cleaned up
   on booked customers too.
4. Tag the "unknown" rows by hand, then **delete `BACKFILL_KEY`**. The page
   goes back to "not found".

Only contacts with a real (not cancelled / no-show) appointment are
touched. The service comes from the appointment's own notes, falling back
to the contact's Service Needed field.
