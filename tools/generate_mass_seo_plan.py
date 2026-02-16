#!/usr/bin/env python3
"""
generate_mass_seo_plan.py — Scalable SEO sub-page plan generator for Elevate Repair.

Produces a JSON plan (~150 entries) of city × appliance × problem pages.
Does NOT generate HTML pages — only the plan file.

Usage:
    python tools/generate_mass_seo_plan.py
    python tools/generate_mass_seo_plan.py --limit 50
    python tools/generate_mass_seo_plan.py --cities denver,aurora
    python tools/generate_mass_seo_plan.py --appliance washer,dryer
    python tools/generate_mass_seo_plan.py --output tools/custom_plan.json
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Auto-detect repository root (parent of tools/)
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

# ---------------------------------------------------------------------------
# City definitions — tier-weighted for priority ordering
# ---------------------------------------------------------------------------
CITIES = [
    # Tier 1 — high search volume
    {"name": "Denver",            "slug": "denver",            "tier": 1},
    {"name": "Lakewood",          "slug": "lakewood",          "tier": 1},
    {"name": "Arvada",            "slug": "arvada",            "tier": 1},
    {"name": "Westminster",       "slug": "westminster",       "tier": 1},
    {"name": "Aurora",            "slug": "aurora",            "tier": 1},
    # Tier 2 — higher-income areas
    {"name": "Highlands Ranch",   "slug": "highlands-ranch",   "tier": 2},
    {"name": "Greenwood Village", "slug": "greenwood-village", "tier": 2},
    {"name": "Lone Tree",         "slug": "lone-tree",         "tier": 2},
    {"name": "Castle Pines",      "slug": "castle-pines",      "tier": 2},
    {"name": "Evergreen",         "slug": "evergreen",         "tier": 2},
]

# ---------------------------------------------------------------------------
# Appliance / problem matrix
# ---------------------------------------------------------------------------
APPLIANCE_PROBLEMS = {
    "Washer": {
        "slug": "washer",
        "service_page": "washer-repair-denver.html",
        "problems": [
            {"name": "Not Draining",  "slug": "not-draining"},
            {"name": "Not Spinning",  "slug": "not-spinning"},
            {"name": "Leaking",       "slug": "leaking"},
            {"name": "Not Starting",  "slug": "not-starting"},
        ],
    },
    "Dryer": {
        "slug": "dryer",
        "service_page": "dryer-repair-denver.html",
        "problems": [
            {"name": "Not Heating",       "slug": "not-heating"},
            {"name": "Not Spinning",      "slug": "not-spinning"},
            {"name": "Making Loud Noise", "slug": "making-loud-noise"},
            {"name": "Not Starting",      "slug": "not-starting"},
        ],
    },
    "Refrigerator": {
        "slug": "refrigerator",
        "service_page": "fridge-repair-denver.html",
        "problems": [
            {"name": "Not Cooling",          "slug": "not-cooling"},
            {"name": "Leaking Water",        "slug": "leaking-water"},
            {"name": "Ice Maker Not Working", "slug": "ice-maker-not-working"},
            {"name": "Not Running",          "slug": "not-running"},
        ],
    },
    "Dishwasher": {
        "slug": "dishwasher",
        "service_page": "dishwasher-repair-denver.html",
        "problems": [
            {"name": "Not Draining",       "slug": "not-draining"},
            {"name": "Not Cleaning Dishes", "slug": "not-cleaning-dishes"},
            {"name": "Leaking",            "slug": "leaking"},
            {"name": "Not Starting",       "slug": "not-starting"},
        ],
    },
    "Oven": {
        "slug": "oven",
        "service_page": "oven-repair-denver.html",
        "problems": [
            {"name": "Not Heating",           "slug": "not-heating"},
            {"name": "Not Turning On",        "slug": "not-turning-on"},
            {"name": "Temperature Inaccurate", "slug": "temperature-inaccurate"},
        ],
    },
}

# ---------------------------------------------------------------------------
# Repository auto-detection helpers
# ---------------------------------------------------------------------------

def detect_existing_html_files():
    """Return a set of all .html filenames already present in the repo root."""
    files = set()
    for f in REPO_ROOT.glob("*.html"):
        files.add(f.name)
    return files


def detect_existing_subpage_files():
    """Return a set of all problem sub-page paths (relative to repo root)."""
    files = set()
    for subdir in REPO_ROOT.iterdir():
        if subdir.is_dir() and subdir.name.endswith("-repair-denver"):
            for f in subdir.glob("*.html"):
                files.add(f"{subdir.name}/{f.name}")
    return files


def resolve_city_page(city_slug, existing_files):
    """Detect the actual city page file from the repo.

    Denver maps to index.html; all others map to {slug}.html.
    Returns the filename or None if the city page doesn't exist.
    """
    if city_slug == "denver":
        return "index.html" if "index.html" in existing_files else None
    candidate = f"{city_slug}.html"
    return candidate if candidate in existing_files else None


def resolve_appliance_page(appliance_data, existing_files):
    """Return the existing service landing page filename, or None."""
    page = appliance_data["service_page"]
    return page if page in existing_files else None


# ---------------------------------------------------------------------------
# Slug / normalization
# ---------------------------------------------------------------------------

def make_slug(city_slug, appliance_slug, problem_slug):
    """Build a page slug: {city}-{appliance}-{problem}.html"""
    raw = f"{city_slug}-{appliance_slug}-{problem_slug}"
    # Normalize: lowercase, collapse whitespace, replace spaces with hyphens
    raw = raw.lower().strip()
    raw = re.sub(r"\s+", "-", raw)
    raw = re.sub(r"-+", "-", raw)
    return f"{raw}.html"


# ---------------------------------------------------------------------------
# Plan entry builder
# ---------------------------------------------------------------------------

def build_entry(city, appliance_name, appliance_data, problem, city_page, appliance_page):
    """Build a single JSON plan entry."""
    slug = make_slug(city["slug"], appliance_data["slug"], problem["slug"])

    city_page_url = f"/{city_page}" if city_page else None
    appliance_page_url = f"/{appliance_page}" if appliance_page else None

    breadcrumbs = [
        {"label": "Home", "url": "/"},
    ]
    if city_page_url:
        breadcrumbs.append({
            "label": city["name"],
            "url": city_page_url,
        })
    if appliance_page_url:
        breadcrumbs.append({
            "label": f"{appliance_name} Repair",
            "url": appliance_page_url,
        })
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
        "category": appliance_name,
        "appliance_slug": appliance_data["slug"],
        "problem": problem["name"],
        "problem_slug": problem["slug"],
        "slug": slug,
        "output_filename": slug,
        "parent_page": city_page or f"{city['slug']}.html",
        "parents": {
            "city_page": f"/{city_page}" if city_page else None,
            "appliance_page": f"/{appliance_page}" if appliance_page else None,
        },
        "breadcrumbs": breadcrumbs,
        "internal_links": internal_links,
    }


# ---------------------------------------------------------------------------
# Main generation logic
# ---------------------------------------------------------------------------

def generate_plan(limit=None, city_filter=None, appliance_filter=None):
    """Generate the full SEO plan.

    Returns (plan_entries, stats) where stats is a dict with counts.
    """
    existing_root_files = detect_existing_html_files()
    existing_subpages = detect_existing_subpage_files()
    all_existing = existing_root_files | {p.split("/")[-1] for p in existing_subpages}

    # Filter cities if requested
    cities = CITIES
    if city_filter:
        slugs = {s.strip().lower() for s in city_filter}
        cities = [c for c in CITIES if c["slug"] in slugs]

    # Filter appliances if requested
    appliances = APPLIANCE_PROBLEMS
    if appliance_filter:
        slugs = {s.strip().lower() for s in appliance_filter}
        appliances = {k: v for k, v in APPLIANCE_PROBLEMS.items() if v["slug"] in slugs}

    plan = []
    seen_slugs = set()
    skipped_existing = 0
    skipped_duplicate = 0
    total_candidates = 0

    # Sort: tier-1 cities first, then tier-2
    sorted_cities = sorted(cities, key=lambda c: c["tier"])

    for city in sorted_cities:
        city_page = resolve_city_page(city["slug"], existing_root_files)

        for appliance_name, appliance_data in appliances.items():
            appliance_page = resolve_appliance_page(appliance_data, existing_root_files)

            for problem in appliance_data["problems"]:
                total_candidates += 1
                slug = make_slug(city["slug"], appliance_data["slug"], problem["slug"])

                # Duplicate check within this run
                if slug in seen_slugs:
                    skipped_duplicate += 1
                    continue

                # Already exists in repo
                if slug in all_existing:
                    skipped_existing += 1
                    seen_slugs.add(slug)
                    continue

                seen_slugs.add(slug)
                entry = build_entry(
                    city, appliance_name, appliance_data, problem,
                    city_page, appliance_page,
                )
                plan.append(entry)

                # Respect limit
                if limit and len(plan) >= limit:
                    break
            if limit and len(plan) >= limit:
                break
        if limit and len(plan) >= limit:
            break

    stats = {
        "total_candidates": total_candidates,
        "total_generated": len(plan),
        "total_skipped_existing": skipped_existing,
        "total_skipped_duplicate": skipped_duplicate,
    }
    return plan, stats


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate a mass SEO page plan (~150 entries) for Elevate Repair."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of plan entries to generate.",
    )
    parser.add_argument(
        "--cities",
        type=str,
        default=None,
        help="Comma-separated list of city slugs to include (e.g., denver,aurora).",
    )
    parser.add_argument(
        "--appliance",
        type=str,
        default=None,
        help="Comma-separated list of appliance slugs to include (e.g., washer,dryer).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file path. Default: tools/seo_plan_mass_150.json",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    city_filter = args.cities.split(",") if args.cities else None
    appliance_filter = args.appliance.split(",") if args.appliance else None

    output_path = args.output or str(SCRIPT_DIR / "seo_plan_mass_150.json")

    print("=" * 60)
    print("  Elevate Repair — Mass SEO Plan Generator")
    print("=" * 60)
    print()

    # Show what we detected
    existing_root = detect_existing_html_files()
    print(f"  Repo root:          {REPO_ROOT}")
    print(f"  Existing HTML files: {len(existing_root)}")
    print(f"  Cities configured:   {len(CITIES)}")
    print(f"  Appliance types:     {len(APPLIANCE_PROBLEMS)}")
    total_problems = sum(len(a["problems"]) for a in APPLIANCE_PROBLEMS.values())
    print(f"  Problems per matrix: {total_problems}")
    print()

    # Verify city pages exist
    print("  City page detection:")
    for city in CITIES:
        page = resolve_city_page(city["slug"], existing_root)
        status = f"-> /{page}" if page else "-> MISSING"
        print(f"    {city['name']:20s} {status}")
    print()

    # Verify appliance pages exist
    print("  Appliance page detection:")
    for name, data in APPLIANCE_PROBLEMS.items():
        page = resolve_appliance_page(data, existing_root)
        status = f"-> /{page}" if page else "-> MISSING"
        print(f"    {name:15s} {status}")
    print()

    # Generate plan
    plan, stats = generate_plan(
        limit=args.limit,
        city_filter=city_filter,
        appliance_filter=appliance_filter,
    )

    # Write output
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(plan, f, indent=2, ensure_ascii=False)
    print(f"  Plan written to: {output_path}")
    print()

    # Summary
    print("-" * 60)
    print("  SUMMARY")
    print("-" * 60)
    print(f"  Total candidates evaluated: {stats['total_candidates']}")
    print(f"  Total generated:            {stats['total_generated']}")
    print(f"  Total skipped (existing):   {stats['total_skipped_existing']}")
    print(f"  Total skipped (duplicate):  {stats['total_skipped_duplicate']}")
    print("-" * 60)

    if args.limit:
        print(f"  (Limited to {args.limit} entries by --limit flag)")

    if city_filter:
        print(f"  (Filtered to cities: {', '.join(city_filter)})")

    if appliance_filter:
        print(f"  (Filtered to appliances: {', '.join(appliance_filter)})")

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
