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

    out["inspection_ready"] = tier_bases("RP_MOVEOUT_BEDROOM_TIERS")
    out["express"] = tier_bases("RP_MOVEOUT_REFRESH_BEDROOM_TIERS")
    out["detail_pass"] = [
        int(x) for x in re.findall(
            r"price:\s*(\d+)",
            re.search(r"RP_DETAIL_PASS_PRICES\s*=\s*\[(.*?)\];", src, re.S).group(1))
    ]
    out["deep"] = scalar("RP_DEEP_ANCHOR_PRICE")
    out["basic"] = scalar("RP_BASIC_ANCHOR_PRICE")
    out["hourly_rate"] = scalar("HOURLY_RATE_PER_CLEANER")
    out["hourly_min_hours"] = scalar("HOURLY_MIN_HOURS")
    out["one_time_min"] = scalar("RP_ONE_TIME_MIN")
    out["recurring_min"] = scalar("RP_RECURRING_MIN_PER_VISIT")
    out["extra_hour"] = scalar("RP_EXTRA_HOUR_RATE")
    out["pet_enzyme"] = scalar("RP_PET_ENZYME_RATE")
    out["military_cap"] = scalar("MILITARY_DISCOUNT_CAP")
    out["carpet"] = int(re.search(r"carpet:\s*\{[^}]*bundlePrice:\s*(\d+)", src).group(1))
    out["fridge"] = int(re.search(r"fridge:\s*\{[^}]*price:\s*(\d+)", src).group(1))
    out["oven"] = int(re.search(r"oven:\s*\{[^}]*price:\s*(\d+)", src).group(1))
    out["cabinets"] = int(re.search(r"cabinets:\s*\{[^}]*price:\s*(\d+)", src).group(1))
    out["garage"] = int(re.search(r"garage:\s*\{[^}]*price:\s*(\d+)", src).group(1))
    out["laundry"] = int(re.search(r"laundry:\s*\{[^}]*pricePerLoad:\s*(\d+)", src).group(1))
    w = re.search(r"windows:\s*\{[^}]*basic:\s*(\d+),\s*premium:\s*(\d+)", src)
    out["windows_basic"], out["windows_premium"] = int(w.group(1)), int(w.group(2))
    return out


def html_files():
    """Every page a customer can read. /book and /call are excluded: they
    load the engine directly and render every number from it."""
    found = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames
                       if d not in (".git", "images", "css", "js", "tools", "workers", "book", "call")]
        for name in filenames:
            if name.endswith(".html"):
                found.append(os.path.join(dirpath, name))
    return sorted(found)


def main():
    p = engine_prices()

    # A published dollar figure that must never appear unless it is current.
    # (stale_value, human_label, current_value)
    top = p["inspection_ready"][-1]
    banned = [
        # Round 26/29 ladder, retired by round 32's $599 ceiling.
        (459, "Inspection Ready 1-2BR (round 26)", p["inspection_ready"][0]),
        (539, "Inspection Ready 3BR (round 26)", p["inspection_ready"][1]),
        (619, "Inspection Ready 4BR (round 26)", top),
        (699, "Inspection Ready 5+BR (round 26)", top),
        (349, "Express 5+BR (retired bracket)", p["express"][-1]),
        (240, "Detail Pass 5+BR (retired bracket)", p["detail_pass"][-1]),
        # Round 25 ladder.
        (379, "Inspection Ready 1-2BR (round 25)", p["inspection_ready"][0]),
        (479, "Inspection Ready 3BR (round 25)", p["inspection_ready"][1]),
        (589, "Inspection Ready 4BR (round 25)", top),
        # Pre-round-25.
        (179, "Express 1-2BR", p["express"][0]),
        (229, "Express 3BR", p["express"][1]),
        (279, "Express 4BR", p["express"][2]),
        (149, "Basic Cleaning", p["basic"]),
        (75, "Carpet per room", p["carpet"]),
        (899, "old custom-quote ceiling", top),
    ]
    # Numbers that are legitimately current elsewhere and must not be flagged
    # just because they collide with a retired price.
    current = set(p["inspection_ready"] + p["express"] + p["detail_pass"] + [
        p["deep"], p["basic"], p["carpet"], p["fridge"], p["oven"], p["cabinets"],
        p["garage"], p["laundry"], p["windows_basic"], p["windows_premium"],
        p["one_time_min"], p["recurring_min"], p["extra_hour"], p["pet_enzyme"],
        p["military_cap"], p["hourly_rate"],
    ])

    problems = []
    for f in html_files():
        rel = os.path.relpath(f, ROOT)
        text = read(f)
        for line_no, line in enumerate(text.splitlines(), 1):
            for amount in set(int(x) for x in re.findall(r"\$(\d{2,4})\b", line)):
                if amount in current:
                    continue
                # "$25 to $75 each" on /pricing is a claim about what OTHER
                # companies charge, not our carpet rate. Only flag a retired
                # per-unit price when the line actually reads as our own rate.
                if amount == 75 and not re.search(r"\$75\s*(?:per|/)\s*(?:carpeted\s+)?room", line):
                    continue
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
    ceiling = p["inspection_ready"][-1]
    for f in html_files():
        rel = os.path.relpath(f, ROOT)
        text = read(f)
        for line_no, line in enumerate(text.splitlines(), 1):
            if "move-out" not in line.lower() and "moveout" not in line.lower():
                continue
            for amount in set(int(x) for x in re.findall(r"\$(\d{3,4})\b", line)):
                if amount > ceiling:
                    problems.append(
                        "%s:%d  publishes $%d on a move-out line, above the $%d ceiling\n      %s"
                        % (rel, line_no, amount, ceiling, line.strip()[:140]))

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
        for line_no, line in enumerate(read(f).splitlines(), 1):
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
        for line_no, line in enumerate(read(f).splitlines(), 1):
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
    for f in html_files() + [os.path.join(ROOT, "call", "index.html")]:
        rel = os.path.relpath(f, ROOT)
        text = read(f)
        for line_no, line in enumerate(text.splitlines(), 1):
            for pattern, expected, label in text_rules:
                for found in re.findall(pattern, line):
                    if int(found) != expected:
                        problems.append(
                            "%s:%d  says %s of %s, engine says %s\n      %s"
                            % (rel, line_no, label, found, expected, line.strip()[:140]))

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
