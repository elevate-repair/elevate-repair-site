#!/usr/bin/env python3
"""
generate_mass_seo_plan.py — Controlled authority cluster SEO plan generator.

Generates exactly 150 sub-page entries under existing city + appliance structure.

Cluster structure:
  Denver (Tier 1):  5 appliances × 8 problems = 40 pages
  Tier 2 cities:    4 appliances × 5 problems × 5 cities = 100 pages
  Denver brands:    10 premium brand × problem pages (refrigerator + dryer)
  Total:            150 pages

Usage:
    python tools/generate_mass_seo_plan.py
    python tools/generate_mass_seo_plan.py --limit 50
    python tools/generate_mass_seo_plan.py --cities denver,aurora
    python tools/generate_mass_seo_plan.py --appliance washer,dryer
"""

import argparse
import json
import os
import re
import sys
from collections import OrderedDict
from pathlib import Path

# ---------------------------------------------------------------------------
# Auto-detect repository root
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

# ===================================================================
# CLUSTER DEFINITION — Controlled authority expansion
# ===================================================================

# ---------------------------------------------------------------------------
# Tier 1: Denver — full cluster (8 problems per appliance, all 5 appliances)
# ---------------------------------------------------------------------------
DENVER = {"name": "Denver", "slug": "denver", "tier": 1}

DENVER_APPLIANCE_PROBLEMS = OrderedDict([
    ("Washer", {
        "slug": "washer",
        "service_page": "washer-repair-denver.html",
        "problems": [
            {"name": "Not Draining",       "slug": "not-draining"},
            {"name": "Not Spinning",        "slug": "not-spinning"},
            {"name": "Leaking Water",       "slug": "leaking-water"},
            {"name": "Not Starting",        "slug": "not-starting"},
            {"name": "Shaking Vibrating",   "slug": "shaking-vibrating"},
            {"name": "Not Filling",         "slug": "not-filling"},
            {"name": "Making Loud Noise",   "slug": "making-loud-noise"},
            {"name": "Won't Agitate",       "slug": "wont-agitate"},
        ],
    }),
    ("Dryer", {
        "slug": "dryer",
        "service_page": "dryer-repair-denver.html",
        "problems": [
            {"name": "Not Heating",         "slug": "not-heating"},
            {"name": "Not Spinning",        "slug": "not-spinning"},
            {"name": "Not Starting",        "slug": "not-starting"},
            {"name": "Making Loud Noise",   "slug": "making-loud-noise"},
            {"name": "Takes Too Long",      "slug": "takes-too-long"},
            {"name": "Overheating",         "slug": "overheating"},
            {"name": "Won't Tumble",        "slug": "wont-tumble"},
            {"name": "Not Drying",          "slug": "not-drying"},
        ],
    }),
    ("Refrigerator", {
        "slug": "refrigerator",
        "service_page": "fridge-repair-denver.html",
        "problems": [
            {"name": "Not Cooling",              "slug": "not-cooling"},
            {"name": "Leaking Water",             "slug": "leaking-water"},
            {"name": "Ice Maker Not Working",     "slug": "ice-maker-not-working"},
            {"name": "Not Running",               "slug": "not-running"},
            {"name": "Freezer Not Freezing",      "slug": "freezer-not-freezing"},
            {"name": "Making Noise",              "slug": "making-noise"},
            {"name": "Too Cold",                  "slug": "too-cold"},
            {"name": "Water Dispenser Not Working", "slug": "water-dispenser-not-working"},
        ],
    }),
    ("Dishwasher", {
        "slug": "dishwasher",
        "service_page": "dishwasher-repair-denver.html",
        "problems": [
            {"name": "Not Draining",        "slug": "not-draining"},
            {"name": "Not Cleaning Dishes",  "slug": "not-cleaning-dishes"},
            {"name": "Leaking Water",        "slug": "leaking-water"},
            {"name": "Not Starting",         "slug": "not-starting"},
            {"name": "Not Drying",           "slug": "not-drying"},
            {"name": "Making Noise",         "slug": "making-noise"},
            {"name": "Won't Fill",           "slug": "wont-fill"},
            {"name": "Door Won't Close",     "slug": "door-wont-close"},
        ],
    }),
    ("Oven", {
        "slug": "oven",
        "service_page": "oven-repair-denver.html",
        "problems": [
            {"name": "Not Heating",              "slug": "not-heating"},
            {"name": "Not Turning On",           "slug": "not-turning-on"},
            {"name": "Temperature Inaccurate",   "slug": "temperature-inaccurate"},
            {"name": "Burner Not Working",       "slug": "burner-not-working"},
            {"name": "Won't Turn Off",           "slug": "wont-turn-off"},
            {"name": "Self-Clean Not Working",   "slug": "self-clean-not-working"},
            {"name": "Door Won't Close",         "slug": "door-wont-close"},
            {"name": "Uneven Heating",           "slug": "uneven-heating"},
        ],
    }),
])

# ---------------------------------------------------------------------------
# Tier 2: High-income cities — 4 appliances × 5 problems (NO oven)
# ---------------------------------------------------------------------------
TIER2_CITIES = [
    {"name": "Aurora",            "slug": "aurora",            "tier": 2},
    {"name": "Highlands Ranch",   "slug": "highlands-ranch",   "tier": 2},
    {"name": "Lakewood",          "slug": "lakewood",          "tier": 2},
    {"name": "Arvada",            "slug": "arvada",            "tier": 2},
    {"name": "Westminster",       "slug": "westminster",       "tier": 2},
]

TIER2_APPLIANCE_PROBLEMS = OrderedDict([
    ("Washer", {
        "slug": "washer",
        "service_page": "washer-repair-denver.html",
        "problems": [
            {"name": "Not Draining",    "slug": "not-draining"},
            {"name": "Not Spinning",    "slug": "not-spinning"},
            {"name": "Leaking Water",   "slug": "leaking-water"},
            {"name": "Not Starting",    "slug": "not-starting"},
            {"name": "Not Filling",     "slug": "not-filling"},
        ],
    }),
    ("Dryer", {
        "slug": "dryer",
        "service_page": "dryer-repair-denver.html",
        "problems": [
            {"name": "Not Heating",       "slug": "not-heating"},
            {"name": "Not Spinning",      "slug": "not-spinning"},
            {"name": "Not Starting",      "slug": "not-starting"},
            {"name": "Making Loud Noise", "slug": "making-loud-noise"},
            {"name": "Not Drying",        "slug": "not-drying"},
        ],
    }),
    ("Refrigerator", {
        "slug": "refrigerator",
        "service_page": "fridge-repair-denver.html",
        "problems": [
            {"name": "Not Cooling",          "slug": "not-cooling"},
            {"name": "Leaking Water",        "slug": "leaking-water"},
            {"name": "Ice Maker Not Working", "slug": "ice-maker-not-working"},
            {"name": "Not Running",          "slug": "not-running"},
            {"name": "Making Noise",         "slug": "making-noise"},
        ],
    }),
    ("Dishwasher", {
        "slug": "dishwasher",
        "service_page": "dishwasher-repair-denver.html",
        "problems": [
            {"name": "Not Draining",       "slug": "not-draining"},
            {"name": "Not Cleaning Dishes", "slug": "not-cleaning-dishes"},
            {"name": "Leaking Water",       "slug": "leaking-water"},
            {"name": "Not Starting",        "slug": "not-starting"},
            {"name": "Not Drying",          "slug": "not-drying"},
        ],
    }),
])

# ---------------------------------------------------------------------------
# Denver brand pages — 10 premium brand × problem (refrigerator + dryer)
# ---------------------------------------------------------------------------
BRAND_PAGES = [
    # Refrigerator — 5 premium brands
    {"brand": "Sub-Zero",   "brand_slug": "sub-zero",   "category": "Refrigerator", "appliance_slug": "refrigerator", "problem": "Not Cooling",          "problem_slug": "not-cooling"},
    {"brand": "Viking",     "brand_slug": "viking",     "category": "Refrigerator", "appliance_slug": "refrigerator", "problem": "Not Cooling",          "problem_slug": "not-cooling"},
    {"brand": "Thermador",  "brand_slug": "thermador",  "category": "Refrigerator", "appliance_slug": "refrigerator", "problem": "Not Cooling",          "problem_slug": "not-cooling"},
    {"brand": "Bosch",      "brand_slug": "bosch",      "category": "Refrigerator", "appliance_slug": "refrigerator", "problem": "Leaking Water",        "problem_slug": "leaking-water"},
    {"brand": "Miele",      "brand_slug": "miele",      "category": "Refrigerator", "appliance_slug": "refrigerator", "problem": "Ice Maker Not Working", "problem_slug": "ice-maker-not-working"},
    # Dryer — 5 premium brands
    {"brand": "Samsung",    "brand_slug": "samsung",    "category": "Dryer",        "appliance_slug": "dryer",        "problem": "Not Heating",           "problem_slug": "not-heating"},
    {"brand": "LG",         "brand_slug": "lg",         "category": "Dryer",        "appliance_slug": "dryer",        "problem": "Not Heating",           "problem_slug": "not-heating"},
    {"brand": "Miele",      "brand_slug": "miele",      "category": "Dryer",        "appliance_slug": "dryer",        "problem": "Not Heating",           "problem_slug": "not-heating"},
    {"brand": "Bosch",      "brand_slug": "bosch",      "category": "Dryer",        "appliance_slug": "dryer",        "problem": "Not Starting",          "problem_slug": "not-starting"},
    {"brand": "Whirlpool",  "brand_slug": "whirlpool",  "category": "Dryer",        "appliance_slug": "dryer",        "problem": "Not Spinning",          "problem_slug": "not-spinning"},
]


# ===================================================================
# Repository auto-detection
# ===================================================================

def detect_existing_html_files():
    """Return a set of all .html filenames in repo root."""
    return {f.name for f in REPO_ROOT.glob("*.html")}


def detect_existing_subpage_files():
    """Return a set of all problem sub-page paths (relative to root)."""
    files = set()
    for subdir in REPO_ROOT.iterdir():
        if subdir.is_dir() and subdir.name.endswith("-repair-denver"):
            for f in subdir.glob("*.html"):
                files.add(f"{subdir.name}/{f.name}")
    return files


def resolve_city_page(city_slug, existing_files):
    """Denver -> index.html, others -> {slug}.html. Returns None if missing."""
    if city_slug == "denver":
        return "index.html" if "index.html" in existing_files else None
    candidate = f"{city_slug}.html"
    return candidate if candidate in existing_files else None


def resolve_appliance_page(service_page, existing_files):
    """Return service page filename if it exists in repo."""
    return service_page if service_page in existing_files else None


# ===================================================================
# Slug normalization
# ===================================================================

def make_slug(city_slug, appliance_slug, problem_slug, brand_slug=None):
    """Build page slug: {city}-{brand?}-{appliance}-{problem}.html"""
    parts = [city_slug]
    if brand_slug:
        parts.append(brand_slug)
    parts.extend([appliance_slug, problem_slug])
    raw = "-".join(parts)
    raw = raw.lower().strip()
    raw = re.sub(r"\s+", "-", raw)
    raw = re.sub(r"-+", "-", raw)
    return f"{raw}.html"


# ===================================================================
# Entry builders
# ===================================================================

def build_city_problem_entry(city, appliance_name, appliance_data, problem,
                              city_page, appliance_page):
    """Build a city × appliance × problem entry."""
    slug = make_slug(city["slug"], appliance_data["slug"], problem["slug"])
    city_url = f"/{city_page}" if city_page else None
    appl_url = f"/{appliance_page}" if appliance_page else None

    breadcrumbs = [{"label": "Home", "url": "/"}]
    if city_url:
        breadcrumbs.append({"label": city["name"], "url": city_url})
    if appl_url:
        breadcrumbs.append({"label": f"{appliance_name} Repair", "url": appl_url})
    breadcrumbs.append({
        "label": f"{appliance_name} {problem['name']}",
        "url": f"/{slug}",
    })

    internal_links = []
    if city_page:
        internal_links.append(f"/{city_page}")
    if appliance_page:
        internal_links.append(f"/{appliance_page}")
    internal_links.append("/book.html")

    return {
        "city": city["name"],
        "city_slug": city["slug"],
        "state": "CO",
        "tier": city["tier"],
        "page_type": "city_problem",
        "category": appliance_name,
        "appliance_slug": appliance_data["slug"],
        "problem": problem["name"],
        "problem_slug": problem["slug"],
        "brand": None,
        "slug": slug,
        "output_filename": slug,
        "parent_page": city_page or f"{city['slug']}.html",
        "parents": {
            "city_page": city_url,
            "appliance_page": appl_url,
        },
        "breadcrumbs": breadcrumbs,
        "internal_links": internal_links,
    }


def build_brand_problem_entry(brand_def, city, city_page, appliance_page):
    """Build a Denver brand × problem entry."""
    slug = make_slug(
        city["slug"], brand_def["appliance_slug"],
        brand_def["problem_slug"], brand_slug=brand_def["brand_slug"],
    )
    city_url = f"/{city_page}" if city_page else None
    appl_url = f"/{appliance_page}" if appliance_page else None

    # Brand page link (detected from repo)
    brand_page = f"/{brand_def['brand_slug']}-appliance-repair-denver.html"

    breadcrumbs = [
        {"label": "Home", "url": "/"},
    ]
    if city_url:
        breadcrumbs.append({"label": city["name"], "url": city_url})
    if appl_url:
        breadcrumbs.append({
            "label": f"{brand_def['category']} Repair",
            "url": appl_url,
        })
    breadcrumbs.append({
        "label": f"{brand_def['brand']} {brand_def['category']} {brand_def['problem']}",
        "url": f"/{slug}",
    })

    internal_links = []
    if city_page:
        internal_links.append(f"/{city_page}")
    if appliance_page:
        internal_links.append(f"/{appliance_page}")
    internal_links.append(brand_page)
    internal_links.append("/book.html")

    # Resolve service page for this appliance
    service_pages = {
        "refrigerator": "fridge-repair-denver.html",
        "dryer": "dryer-repair-denver.html",
    }

    return {
        "city": city["name"],
        "city_slug": city["slug"],
        "state": "CO",
        "tier": 1,
        "page_type": "brand_problem",
        "category": brand_def["category"],
        "appliance_slug": brand_def["appliance_slug"],
        "problem": brand_def["problem"],
        "problem_slug": brand_def["problem_slug"],
        "brand": brand_def["brand"],
        "brand_slug": brand_def["brand_slug"],
        "slug": slug,
        "output_filename": slug,
        "parent_page": city_page or "index.html",
        "parents": {
            "city_page": city_url,
            "appliance_page": appl_url,
            "brand_page": brand_page,
        },
        "breadcrumbs": breadcrumbs,
        "internal_links": internal_links,
    }


# ===================================================================
# Plan generation
# ===================================================================

def generate_plan(limit=None, city_filter=None, appliance_filter=None):
    """Generate the controlled authority cluster plan.

    Returns (plan, stats, conflicts).
    """
    existing_root = detect_existing_html_files()
    existing_subpages = detect_existing_subpage_files()
    all_existing = existing_root | {p.split("/")[-1] for p in existing_subpages}

    plan = []
    seen_slugs = set()
    conflicts = []
    stats = {
        "denver_city_problems": 0,
        "tier2_city_problems": 0,
        "denver_brand_problems": 0,
        "skipped_existing": 0,
        "skipped_duplicate": 0,
    }

    def add_entry(entry, stat_key):
        """Add entry if no conflicts. Returns True if added."""
        slug = entry["slug"]
        if slug in seen_slugs:
            stats["skipped_duplicate"] += 1
            return False
        if slug in all_existing:
            stats["skipped_existing"] += 1
            conflicts.append(slug)
            seen_slugs.add(slug)
            return False
        seen_slugs.add(slug)
        plan.append(entry)
        stats[stat_key] += 1
        return True

    # ------------------------------------------------------------------
    # Phase 1: Denver — 5 appliances × 8 problems = 40
    # ------------------------------------------------------------------
    denver_page = resolve_city_page("denver", existing_root)
    appliances_to_use = DENVER_APPLIANCE_PROBLEMS
    if appliance_filter:
        slugs = {s.strip().lower() for s in appliance_filter}
        appliances_to_use = OrderedDict(
            (k, v) for k, v in DENVER_APPLIANCE_PROBLEMS.items()
            if v["slug"] in slugs
        )

    should_include_denver = True
    if city_filter:
        city_slugs = {s.strip().lower() for s in city_filter}
        should_include_denver = "denver" in city_slugs

    if should_include_denver:
        for appl_name, appl_data in appliances_to_use.items():
            appl_page = resolve_appliance_page(appl_data["service_page"], existing_root)
            for problem in appl_data["problems"]:
                entry = build_city_problem_entry(
                    DENVER, appl_name, appl_data, problem,
                    denver_page, appl_page,
                )
                add_entry(entry, "denver_city_problems")
                if limit and len(plan) >= limit:
                    break
            if limit and len(plan) >= limit:
                break

    # ------------------------------------------------------------------
    # Phase 2: Tier 2 cities — 4 appliances × 5 problems × 5 cities = 100
    # ------------------------------------------------------------------
    tier2_cities = TIER2_CITIES
    if city_filter:
        city_slugs = {s.strip().lower() for s in city_filter}
        tier2_cities = [c for c in TIER2_CITIES if c["slug"] in city_slugs]

    tier2_appliances = TIER2_APPLIANCE_PROBLEMS
    if appliance_filter:
        slugs = {s.strip().lower() for s in appliance_filter}
        tier2_appliances = OrderedDict(
            (k, v) for k, v in TIER2_APPLIANCE_PROBLEMS.items()
            if v["slug"] in slugs
        )

    if not (limit and len(plan) >= limit):
        for city in tier2_cities:
            city_page = resolve_city_page(city["slug"], existing_root)
            for appl_name, appl_data in tier2_appliances.items():
                appl_page = resolve_appliance_page(appl_data["service_page"], existing_root)
                for problem in appl_data["problems"]:
                    entry = build_city_problem_entry(
                        city, appl_name, appl_data, problem,
                        city_page, appl_page,
                    )
                    add_entry(entry, "tier2_city_problems")
                    if limit and len(plan) >= limit:
                        break
                if limit and len(plan) >= limit:
                    break
            if limit and len(plan) >= limit:
                break

    # ------------------------------------------------------------------
    # Phase 3: Denver brand pages — 10 premium brand × problem
    # ------------------------------------------------------------------
    if not (limit and len(plan) >= limit) and should_include_denver:
        for brand_def in BRAND_PAGES:
            if appliance_filter:
                if brand_def["appliance_slug"] not in {s.strip().lower() for s in appliance_filter}:
                    continue
            service_pages = {
                "refrigerator": "fridge-repair-denver.html",
                "dryer": "dryer-repair-denver.html",
            }
            appl_page = resolve_appliance_page(
                service_pages.get(brand_def["appliance_slug"], ""),
                existing_root,
            )
            entry = build_brand_problem_entry(brand_def, DENVER, denver_page, appl_page)
            add_entry(entry, "denver_brand_problems")
            if limit and len(plan) >= limit:
                break

    return plan, stats, conflicts


# ===================================================================
# CLI
# ===================================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="Controlled authority cluster SEO plan — 150 pages."
    )
    parser.add_argument("--limit", type=int, default=None,
                        help="Cap total plan entries.")
    parser.add_argument("--cities", type=str, default=None,
                        help="Comma-separated city slugs (e.g., denver,aurora).")
    parser.add_argument("--appliance", type=str, default=None,
                        help="Comma-separated appliance slugs (e.g., washer,dryer).")
    parser.add_argument("--output", type=str, default=None,
                        help="Output path. Default: tools/seo_plan_mass_150.json")
    return parser.parse_args()


def main():
    args = parse_args()
    city_filter = args.cities.split(",") if args.cities else None
    appliance_filter = args.appliance.split(",") if args.appliance else None
    output_path = args.output or str(SCRIPT_DIR / "seo_plan_mass_150.json")

    existing_root = detect_existing_html_files()

    print("=" * 64)
    print("  Elevate Repair — Controlled Authority Cluster Plan")
    print("=" * 64)
    print()

    # --- Repo detection ---
    print("  REPOSITORY DETECTION")
    print("  " + "-" * 40)
    print(f"  Root:       {REPO_ROOT}")
    print(f"  HTML files: {len(existing_root)}")
    print()

    print("  City pages:")
    all_cities = [DENVER] + TIER2_CITIES
    for city in all_cities:
        page = resolve_city_page(city["slug"], existing_root)
        tier_label = f"[Tier {city['tier']}]"
        status = f"/{page}" if page else "MISSING"
        print(f"    {tier_label} {city['name']:20s} -> {status}")
    print()

    print("  Appliance service pages:")
    seen_services = set()
    for appl_set in [DENVER_APPLIANCE_PROBLEMS, TIER2_APPLIANCE_PROBLEMS]:
        for name, data in appl_set.items():
            if data["service_page"] not in seen_services:
                seen_services.add(data["service_page"])
                page = resolve_appliance_page(data["service_page"], existing_root)
                status = f"/{page}" if page else "MISSING"
                print(f"    {name:15s} -> {status}")
    print()

    # --- Generate ---
    plan, stats, conflicts = generate_plan(
        limit=args.limit,
        city_filter=city_filter,
        appliance_filter=appliance_filter,
    )

    # --- Write output ---
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(plan, f, indent=2, ensure_ascii=False)

    # --- Per-city breakdown ---
    print("  PLAN BREAKDOWN BY CITY")
    print("  " + "-" * 40)
    from collections import Counter
    city_counts = Counter()
    city_type_counts = {}
    for entry in plan:
        key = entry["city"]
        city_counts[key] += 1
        if key not in city_type_counts:
            city_type_counts[key] = Counter()
        city_type_counts[key][entry["page_type"]] += 1

    for city_info in [DENVER] + TIER2_CITIES:
        name = city_info["name"]
        count = city_counts.get(name, 0)
        types = city_type_counts.get(name, {})
        cp = types.get("city_problem", 0)
        bp = types.get("brand_problem", 0)
        detail = f"({cp} problems"
        if bp:
            detail += f" + {bp} brand"
        detail += ")"
        tier_label = f"[Tier {city_info['tier']}]"
        print(f"    {tier_label} {name:20s} {count:>4} pages  {detail}")
    print(f"    {'':27s} {'─' * 4}")
    print(f"    {'TOTAL':27s} {len(plan):>4} pages")
    print()

    # --- Conflicts ---
    if conflicts:
        print("  SLUG CONFLICTS (skipped — already in repo)")
        print("  " + "-" * 40)
        for slug in conflicts:
            print(f"    !! {slug}")
        print()
    else:
        print("  SLUG CONFLICTS: None detected")
        print()

    # --- Summary ---
    print("  " + "=" * 40)
    print("  SUMMARY")
    print("  " + "=" * 40)
    print(f"  Denver city problems:  {stats['denver_city_problems']:>4}")
    print(f"  Tier 2 city problems:  {stats['tier2_city_problems']:>4}")
    print(f"  Denver brand problems: {stats['denver_brand_problems']:>4}")
    print(f"  Skipped (existing):    {stats['skipped_existing']:>4}")
    print(f"  Skipped (duplicate):   {stats['skipped_duplicate']:>4}")
    print(f"  ─────────────────────────────")
    print(f"  TOTAL GENERATED:       {len(plan):>4}")
    print("  " + "=" * 40)
    print()
    print(f"  Output: {output_path}")
    print()

    if args.limit:
        print(f"  (Capped at {args.limit} by --limit)")
    if city_filter:
        print(f"  (Filtered: cities={','.join(city_filter)})")
    if appliance_filter:
        print(f"  (Filtered: appliances={','.join(appliance_filter)})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
