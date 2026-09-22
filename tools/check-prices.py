#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check-prices.py — guard against published prices drifting from the engine.

WHY THIS EXISTS
---------------
js/rp-pricing-engine.js opens with a rule: "Pricing changes belong ONLY
here. Never duplicate a price into /book or /call." That rule holds well
inside the app, but the marketing pages have no such discipline, and
nothing checked them. As of the round-29 review the live site was
publishing, simultaneously:

  * carpet cleaning at $75/room on the homepage FAQ and on the whole
    carpet landing page (engine: $50)
  * deep cleaning "starts at $199" on the house-cleaning page
    (engine: a flat $300 — a 50% gap a customer discovers only after
    clicking through to the estimator)
  * basic cleaning "starts at $149" on two pages (engine: $150)
  * Inspection Ready at $299 and Express at $179 in the homepage's
    Offer schema — two full pricing rounds out of date

Every one of those was introduced the same way: a price moved in the
engine and nobody grepped the HTML. This script does the grep.

USAGE
-----
    python3 tools/check-prices.py           # from the repo root
    echo $?                                 # 0 = clean, 1 = drift found

Run it before shipping any round that touches pricing. It reads the real
numbers out of js/rp-pricing-engine.js — it is not a second copy of the
price list, so it cannot itself go stale.
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "js", "rp-pricing-engine.js")




def _blank(m):
    """Replace a comment with the same number of newlines, so line numbers
    reported to the user still match the real file."""
    return "\n" * m.group(0).count("\n")


def strip_comments(html):
    """Round 49: the round-48 run reported book/index.html as claiming "61
    reviews". It does not -- the number appears in a /* ... */ note in the
    stylesheet explaining what the strip USED to say. A guard that cries wolf
    gets ignored, so comments come out before anything is matched. Line
    numbers are preserved so the reported location is still useful."""
    html = re.sub(r"<!--.*?-->", _blank, html, flags=re.S)     # HTML comments
    html = re.sub(r"/\*.*?\*/", _blank, html, flags=re.S)      # CSS/JS block comments
    html = re.sub(r"(?m)^\s*//.*$", "", html)                  # JS line comments
    return html


def read(path):
    with io.open(path, encoding="utf-8") as fh:
        return fh.read()


def engine_prices():
    """Pull the live numbers straight out of the engine."""
    src = read(ENGINE)
    out = {}

    def tier_bases(const_name):
        m = re.search(const_name + r"\s*=\s*\[(.*?)\];", src, re.S)
        if not m:
            sys.exit("could not find %s in the engine" % const_name)
        return [int(x) for x in re.findall(r"base:\s*(\d+)", m.group(1))]

    def scalar(const_name):
        m = re.search(r"\b" + const_name + r"\s*=\s*(\d+)\s*;", src)
        if not m:
            sys.exit("could not find %s in the engine" % const_name)
        return int(m.group(1))

    # Round 52: one move-out ladder. RP_MOVEOUT_REFRESH_BEDROOM_TIERS and
    # RP_DETAIL_PASS_PRICES no longer exist in the engine, so reading them
    # here would sys.exit() on every run.
    out["moveout"] = tier_bases("RP_MOVEOUT_BEDROOM_TIERS")
    out["deep"] = scalar("RP_DEEP_ANCHOR_PRICE")
    out["basic"] = scalar("RP_BASIC_ANCHOR_PRICE")
    out["hourly_rate"] = scalar("HOURLY_RATE_PER_CLEANER")
    out["labour_rate"] = scalar("RP_HOURLY_LABOUR_RATE")
    out["hourly_min_hours"] = scalar("HOURLY_MIN_HOURS")
    out["one_time_min"] = scalar("RP_ONE_TIME_MIN")
    out["recurring_min"] = scalar("RP_RECURRING_MIN_PER_VISIT")
    out["extra_hour"] = scalar("RP_EXTRA_HOUR_RATE")
    out["pet_enzyme"] = scalar("RP_PET_ENZYME_RATE")
    out["carpet"] = int(re.search(r"carpet:\s*\{[^}]*bundlePrice:\s*(\d+)", src).group(1))
    out["fridge"] = int(re.search(r"fridge:\s*\{[^}]*price:\s*(\d+)", src).group(1))
    out["garage"] = int(re.search(r"garage:\s*\{[^}]*price:\s*(\d+)", src).group(1))
    out["laundry"] = int(re.search(r"laundry:\s*\{[^}]*pricePerLoad:\s*(\d+)", src).group(1))
    # Round 66: exterior windows moved from a flat basic/premium pair to
    # per-window pricing with a floor. The old keys are gone from the engine,
    # so reading them here would sys.exit() on every run.
    w = re.search(r"windows:\s*\{[^}]*perWindow:\s*(\d+),\s*screensPerWindow:\s*(\d+),\s*minimum:\s*(\d+)", src)
    out["windows_per"], out["windows_screens"], out["windows_min"] = (
        int(w.group(1)), int(w.group(2)), int(w.group(3)))
    # Round 66: the Whole-Home Reset, and the heavy-condition ladder.
    out["reset"] = scalar("RP_RESET_ANCHOR_PRICE")
    heavy = float(re.search(r"heavy:\s*([0-9.]+)", src).group(1))
    out["heavy_pct"] = int(round(heavy * 100))
    # The heavy prices are DERIVED here, using the same round-to-the-dollar
    # rule as rpConditionSurchargeCents() in the engine, rather than being
    # typed in. That is the whole point: /pricing publishes a heavy column,
    # and this is what proves those four numbers are the ones a customer is
    # actually charged. Change the multiplier in the engine and this check
    # starts demanding the published table be updated to match.
    out["moveout_heavy"] = [b + int(round(b * heavy)) for b in out["moveout"]]
    return out


def glob_assets():
    """Every file _headers caches as immutable, so every file whose
    reference must carry a current ?v= hash."""
    import glob as _glob
    out = []
    for pat in ("css/*.css", "js/*.js"):
        out.extend(_glob.glob(os.path.join(ROOT, pat)))
    return out


def html_files():
    """Every page a customer can read. /book and /call are excluded: they
    load the engine directly and render every number from it.

    ROUND 52 -- "red-prairie-cleaning-main" is excluded as a TRIPWIRE, not
    because such a folder exists. It did: the repo contained a copy of
    itself at that path, a previous delivery zip (which by its own note
    "contains ONLY the files that changed") unzipped one directory too deep
    instead of over the repo root. Its pages predated round 29 -- carpet at
    $75/room, Basic at $149 -- and they were live at
    /red-prairie-cleaning-main/... competing with the real landing pages.
    It was deleted in round 52; its two change notes were kept and moved to
    /docs/.

    The exclusion stays because the same mistake can be made again by
    anyone who extracts a delivery zip the wrong way, and if it is, this
    guard would otherwise drown in ~50 findings that are all one finding.
    If the walk below ever has something to skip here, that has happened
    again -- and the fix is to delete the folder, not to trust this line."""
    found = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames
                       if d not in (".git", "images", "css", "js", "tools", "workers",
                                    "book", "call", "red-prairie-cleaning-main")]
        for name in filenames:
            if name.endswith(".html"):
                found.append(os.path.join(dirpath, name))
    return sorted(found)


def main():
    p = engine_prices()

    # A published dollar figure that must never appear unless it is current.
    # (stale_value, human_label, current_value)
    top = p["moveout"][-1]
    banned = [
        # ROUND 52 retired the two-tier ladder entirely. Everything below is
        # a price this business really did publish and no longer charges.
        # The list is append-only on purpose: a number that resurfaces in
        # copy months later is exactly what this guard is for.
        #
        # A retired figure is only listed if it is NOT currently live
        # somewhere else -- `current` is checked first, so a banned entry
        # that can never fire is just a thing to misread later. That is why
        # 199, 299, 399 and 499 are absent (they are the live ladder), and
        # why 120 and 240 are absent (Basic and Deep).
        #
        # Round 45-51 ladder, retired by round 52.
        (349, "Move-Out 1-2BR (round 45)", p["moveout"][0]),
        (429, "Move-Out 3BR (round 45)", p["moveout"][1]),
        (629, "Move-Out 5BR (round 51)", top),
        # Move-Out Express, retired with the tier itself in round 52. 199 is
        # NOT banned -- it was Express's 1-2BR price and is now the whole
        # product's entry price.
        (249, "Move-Out Express 3BR", p["moveout"][1]),
        (379, "Move-Out Express 5BR", top),
        # Detail Pass, deleted in round 52 along with the Express buy-backs.
        (90,  "Detail Pass 1-2BR", 0),
        (130, "Detail Pass 3BR", 0),
        (170, "Detail Pass 4BR", 0),
        (180, "Detail Pass 3BR (round 32)", 0),
        (210, "Detail Pass 4+BR (round 32)", 0),
        (240, "Detail Pass 5BR (round 51)", 0),
        # Round 26/29 ladder, retired by round 32's $599 ceiling.
        (459, "Move-Out 1-2BR (round 26)", p["moveout"][0]),
        (539, "Move-Out 3BR (round 26)", p["moveout"][1]),
        (619, "Move-Out 4BR (round 26)", top),
        (699, "Move-Out 5+BR (round 26)", top),
        # Round 32 and 41 ladders.
        (599, "Move-Out 4BR (round 32)", top),
        (479, "Move-Out 3BR (round 25)", p["moveout"][1]),
        (589, "Move-Out 4BR (round 25)", top),
        (474, "Move-Out 3BR (round 41)", p["moveout"][1]),
        (569, "Move-Out 4BR (round 41)", top),
        # Pre-round-25 Express.
        (179, "Move-Out Express 1-2BR (pre-round-25)", p["moveout"][0]),
        (229, "Move-Out Express 3BR (pre-round-25)", p["moveout"][1]),
        (279, "Move-Out Express 4BR (pre-round-25)", p["moveout"][2]),
        # Timed services, re-rated to $40/hr in round 52.
        (300, "Deep Cleaning (pre-round-52)", p["deep"]),
        (149, "Basic Cleaning (pre-round-29)", p["basic"]),
        # The $115 recurring minimum went when the recurring discount did.
        (115, "recurring minimum (pre-round-52)", p["recurring_min"]),
        (75, "Carpet per room", p["carpet"]),
        (899, "old custom-quote ceiling", top),
    ]
    # Numbers that are legitimately current elsewhere and must not be flagged
    # just because they collide with a retired price.
    current = set(p["moveout"] + p["moveout_heavy"] + [
        p["deep"], p["basic"], p["carpet"], p["fridge"],
        p["garage"], p["laundry"], p["windows_min"],
        p["one_time_min"], p["recurring_min"], p["extra_hour"], p["pet_enzyme"],
        p["hourly_rate"],
        # Round 66: the Reset, and the doubled extra-hour rate it bills
        # (two cleaners x $40). Both are real published numbers now.
        p["reset"], p["extra_hour"] * 2,
    ])

    problems = []
    for f in html_files():
        rel = os.path.relpath(f, ROOT)
        text = strip_comments(read(f))
        for line_no, line in enumerate(text.splitlines(), 1):
            for amount in set(int(x) for x in re.findall(r"\$(\d{2,4})\b", line)):
                if amount in current:
                    continue
                # "$25 to $75 each" on /pricing is a claim about what OTHER
                # companies charge, not our carpet rate. Only flag a retired
                # per-unit price when the line actually reads as our own rate.
                if amount == 75 and not re.search(r"\$75\s*(?:per|/)\s*(?:carpeted\s+)?room", line):
                    continue
                # Round 52: $150 was the one-time minimum AND Basic's price
                # until this round; it is now only the garage floor wash, so
                # it is in `current` via p["garage"] and never reaches the
                # banned loop. Noted here because the absence is deliberate:
                # a "$150 minimum" left in copy somewhere will NOT be caught
                # by the dollar-figure scan. The text_rules block below is
                # where a claim like that has to be caught instead.
                for stale, label, now in banned:
                    if amount == stale:
                        problems.append(
                            "%s:%d  $%d looks like a retired %s price (engine says $%d)\n      %s"
                            % (rel, line_no, amount, label, now, line.strip()[:140]))
                        break

    # A published move-out figure above the engine's top tier is drift: the
    # ladder stops there, so any larger number on a move-out line came from
    # somewhere other than the engine.
    #
    # Round 37 note: this rule used to exist because "No move-out over $599"
    # was a promise the site made. That claim is gone (direct instruction),
    # but the check is still worth keeping on its own merits — it just
    # guards against a stale number now rather than against a broken
    # promise.
    # Round 66: the ceiling is the top of the HEAVY ladder, not the standard
    # one. A five-bedroom in heavy condition is a real, published $624, so
    # pinning this at $499 would flag the correct number on /pricing as
    # drift. The rule still does its job -- anything above the heaviest
    # priced job we sell did not come from the engine.
    ceiling = max(p["moveout"][-1], p["moveout_heavy"][-1])
    for f in html_files():
        rel = os.path.relpath(f, ROOT)
        text = strip_comments(read(f))
        for line_no, line in enumerate(text.splitlines(), 1):
            if "move-out" not in line.lower() and "moveout" not in line.lower():
                continue
            for amount in set(int(x) for x in re.findall(r"\$(\d{3,4})\b", line)):
                if amount > ceiling:
                    problems.append(
                        "%s:%d  publishes $%d on a move-out line, above the $%d ceiling\n      %s"
                        % (rel, line_no, amount, ceiling, line.strip()[:140]))

    # =====================================================================
    # ROUND 66 — THE HEAVY COLUMN ON /pricing MUST BE THE REAL LADDER
    # =====================================================================
    # Every other check in this file is negative: it looks for numbers that
    # should NOT appear. This one is positive, because a published surcharge
    # column is a promise about arithmetic and the failure mode is a number
    # that is merely plausible. $374 and $384 both look fine on a page; only
    # one of them is 25% above $299.
    #
    # Matches the standard price in a row and asserts the heavy price beside
    # it, so the two columns can never drift apart or fall out of order.
    pricing_path = os.path.join(ROOT, "pricing", "index.html")
    if os.path.exists(pricing_path):
        ladder = dict(zip(p["moveout"], p["moveout_heavy"]))
        seen = set()
        for line_no, line in enumerate(strip_comments(read(pricing_path)).splitlines(), 1):
            amounts = [int(x) for x in re.findall(r"\$(\d{3,4})\b", line)]
            if len(amounts) != 2:
                continue
            std, heavy_shown = amounts
            if std not in ladder:
                continue
            seen.add(std)
            if heavy_shown != ladder[std]:
                problems.append(
                    "pricing/index.html:%d  heavy price for the $%d tier is $%d, engine says $%d (+%d%%)\n      %s"
                    % (line_no, std, heavy_shown, ladder[std], p["heavy_pct"], line.strip()[:140]))
        missing = [b for b in p["moveout"] if b not in seen]
        if missing:
            problems.append(
                "pricing/index.html  publishes a heavy column but is missing the %s tier(s)"
                % ", ".join("$%d" % b for b in missing))

    # Round 32: claims the business makes about itself now live in
    # js/rp-messages.js. A page that hardcodes a different review count is
    # the exact bug that file was created to stop (/pricing said 57+ while
    # every other page said 61+).
    msg = read(os.path.join(ROOT, "js", "rp-messages.js"))
    review_count = int(re.search(r"reviewCount:\s*(\d+)", msg).group(1))
    # (The priceCeiling assertion that used to sit here went with the claim
    #  it checked -- see round 37. The fact no longer exists to check.)
    for f in html_files() + [os.path.join(ROOT, "book", "index.html"),
                             os.path.join(ROOT, "call", "index.html")]:
        rel = os.path.relpath(f, ROOT)
        for line_no, line in enumerate(strip_comments(read(f)).splitlines(), 1):
            for found in re.findall(r"(\d{2,4})\+?\s*(?:five-star\s+)?(?:reviews|ratings)", line, re.I):
                if int(found) != review_count:
                    problems.append(
                        "%s:%d  says %s reviews, rp-messages.js says %d\n      %s"
                        % (rel, line_no, found, review_count, line.strip()[:140]))

    # Round 34: the meta descriptions now lead with a real price, because a
    # published number is this business's biggest differentiator in a SERP
    # full of "call for a quote". That makes the description a drift surface:
    # it is the one place a stale price is invisible on the page itself and
    # visible to every searcher. Every dollar figure in a description must be
    # a live engine number.
    for f in html_files():
        rel = os.path.relpath(f, ROOT)
        for line_no, line in enumerate(strip_comments(read(f)).splitlines(), 1):
            if 'name="description"' not in line:
                continue
            for amount in set(int(x) for x in re.findall(r"\$(\d{2,4})\b", line)):
                if amount not in current:
                    problems.append(
                        "%s:%d  meta description publishes $%d, which is not a live engine price\n      %s"
                        % (rel, line_no, amount, line.strip()[:140]))

    # Copy claims that have to track a constant, not just a dollar figure.
    text_rules = [
        (r"(\d+)-hour minimum", p["hourly_min_hours"], "hourly minimum hours"),
        (r"(\d+)-room minimum", 2, "carpet room minimum"),
    ]

    # Round 52: claims that no dollar-figure scan can catch, because the
    # thing that changed is a WORD. Recurring discounts were removed and the
    # two move-out tiers were collapsed into one product; copy asserting
    # either is drift even though every number on the line may be current.
    retired_phrases = [
        (r"Move-Out Express", "the Move-Out Express tier was retired in round 52"),
        (r"Inspection Ready\s+(?:Move-Out|move-out|clean|tier)",
         "the Inspection Ready tier name was retired in round 52"),
        (r"Detail Pass", "the Detail Pass add-on was deleted in round 52"),
        (r"(?:saves?|save)\s+\d+%|\d+%\s+off\s+(?:every\s+visit|recurring)",
         "recurring discounts were removed in round 52"),
        (r"both\s+(?:Move-Out\s+)?tiers|switch tiers|either tier",
         "there is only one move-out tier as of round 52"),
    ]
    # Deliberate mentions of a retired name. A CSR coaching note that tells
    # somebody how to answer "what happened to the cheaper one" HAS to say
    # the old name out loud -- that is the whole point of the note. Each
    # entry is a substring that must appear on the line for it to be
    # forgiven, so the exemption is narrow: it forgives that sentence, not
    # every future use of the word on that page.
    retired_ok = [
        "Round 52 retired Move-Out Express",
        "This used to be the Express buy-back list",
    ]
    for f in html_files() + [os.path.join(ROOT, "book", "index.html"),
                             os.path.join(ROOT, "call", "index.html")]:
        rel = os.path.relpath(f, ROOT)
        for line_no, line in enumerate(strip_comments(read(f)).splitlines(), 1):
            if any(ok in line for ok in retired_ok):
                continue
            for pattern, why in retired_phrases:
                if re.search(pattern, line):
                    problems.append(
                        "%s:%d  %s\n      %s"
                        % (rel, line_no, why, line.strip()[:140]))
                    break
    for f in html_files() + [os.path.join(ROOT, "call", "index.html")]:
        rel = os.path.relpath(f, ROOT)
        text = strip_comments(read(f))
        for line_no, line in enumerate(text.splitlines(), 1):
            for pattern, expected, label in text_rules:
                for found in re.findall(pattern, line):
                    if int(found) != expected:
                        problems.append(
                            "%s:%d  says %s of %s, engine says %s\n      %s"
                            % (rel, line_no, label, found, expected, line.strip()[:140]))

    # =====================================================================
    # ASSET STAMP FRESHNESS  (round 52)
    # =====================================================================
    # This is the check that would have caught the round-52 outage.
    #
    # _headers caches /js/* and /css/* as `immutable` for a year, which is
    # only safe because every reference carries a ?v= content hash that
    # changes with the file. tools/stamp-assets.py maintains it. Round 52
    # rewrote js/rp-pricing-engine.js and did not re-run it, so the URL
    # stayed identical while its contents changed -- which unlinks a page
    # from its engine and lets any cache pair mismatched halves. One
    # pairing quietly quotes last round's prices; the other throws on first
    # render and leaves the customer on a blank booking page.
    #
    # A stale stamp is exactly the class of drift this script exists for.
    # It just is not a dollar figure, which is why nothing caught it.
    import hashlib
    for asset in sorted(glob_assets()):
        want = hashlib.sha1(io.open(asset, "rb").read()).hexdigest()[:8]
        base = os.path.basename(asset)
        for f in html_files() + [os.path.join(ROOT, "book", "index.html"),
                                 os.path.join(ROOT, "call", "index.html")]:
            rel = os.path.relpath(f, ROOT)
            for line_no, line in enumerate(read(f).splitlines(), 1):
                for got in re.findall(re.escape(base) + r"\?v=([a-f0-9]+)", line):
                    if got != want:
                        problems.append(
                            "%s:%d  %s is stamped ?v=%s but its contents hash to %s"
                            "\n      run: python3 tools/stamp-assets.py"
                            % (rel, line_no, base, got, want))
                # An unstamped reference is the same bug with the version
                # missing entirely -- immutable caching with no cache key.
                if re.search(r'(?:src|href)="[^"]*' + re.escape(base) + r'"', line):
                    problems.append(
                        "%s:%d  %s is referenced with NO ?v= stamp"
                        "\n      run: python3 tools/stamp-assets.py"
                        % (rel, line_no, base))

    print("Engine prices:")
    for k in sorted(p):
        print("  %-18s %s" % (k, p[k]))
    print("")

    if problems:
        print("DRIFT FOUND — %d issue(s):\n" % len(problems))
        for msg in problems:
            print("  " + msg)
        return 1

    print("No price drift found across %d published pages." % len(html_files()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
