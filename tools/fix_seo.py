#!/usr/bin/env python3
"""
SEO fixes:
1. BreadcrumbList schema fixes on all problem pages
2. Title / og:title formula fix on all problem pages  
3. Shorten 24 long meta descriptions
"""
import re, json, os, glob

BASE = "https://elevaterepair.com"

HUBS = {
    "dishwasher": f"{BASE}/dishwasher-repair-denver",
    "dryer":      f"{BASE}/dryer-repair-denver",
    "oven":       f"{BASE}/oven-repair-denver",
    "refrigerator": f"{BASE}/fridge-repair-denver",
    "washer":     f"{BASE}/washer-repair-denver",
}
HUB_NAMES = {
    "dishwasher":   "Dishwasher Repair",
    "dryer":        "Dryer Repair",
    "oven":         "Oven & Range Repair",
    "refrigerator": "Refrigerator Repair",
    "washer":       "Washer Repair",
}
CITY_INFO = {
    "aurora":          ("Aurora",          f"{BASE}/aurora"),
    "arvada":          ("Arvada",          f"{BASE}/arvada"),
    "highlands-ranch": ("Highlands Ranch", f"{BASE}/highlands-ranch"),
    "lakewood":        ("Lakewood",        f"{BASE}/lakewood"),
    "westminster":     ("Westminster",     f"{BASE}/westminster"),
}
BRANDS = ["bosch","lg","miele","samsung","sub-zero","thermador","viking","whirlpool"]

# ── helpers ──────────────────────────────────────────────────────────────────

def get_appliance(slug):
    if "dishwasher" in slug: return "dishwasher"
    if "dryer"      in slug: return "dryer"
    if "oven"       in slug: return "oven"
    if any(k in slug for k in ("refrigerator","freezer","fridge","ice-maker","water-dispenser")): return "refrigerator"
    if "washer"     in slug: return "washer"
    return None

def classify(fname):
    base = os.path.basename(fname).replace(".html","")
    for brand in BRANDS:
        if base.startswith(f"denver-{brand}-"):
            remainder = base[len(f"denver-{brand}-"):]
            return "brand_city", brand, None, get_appliance(remainder)
    if base.startswith("denver-"):
        return "denver_problem", None, None, get_appliance(base)
    for city_slug, (city_name, city_url) in CITY_INFO.items():
        if base.startswith(f"{city_slug}-"):
            return "city_problem", None, (city_slug, city_name, city_url), get_appliance(base)
    return None, None, None, None

def get_h1(content):
    m = re.search(r'<h1[^>]*>(.*?)</h1>', content, re.DOTALL)
    if not m: return ""
    return re.sub(r'<[^>]+>', '', m.group(1)).strip()

def h1_to_page_label(h1):
    """Strip 'Repair in City' suffix, fix 'Shaking Vibrating' → 'Shaking & Vibrating'."""
    label = re.sub(r'\s+Repair in .+$', '', h1).strip()
    label = re.sub(r'\s+in .+$', '', label).strip()
    label = label.replace("Shaking Vibrating", "Shaking & Vibrating")
    return label

# ── 1. Breadcrumb fix ────────────────────────────────────────────────────────

def fix_breadcrumb(content, page_type, brand, city_info, appliance):
    if not appliance or appliance not in HUBS:
        return content, False

    hub_url  = HUBS[appliance]
    hub_name = HUB_NAMES[appliance]
    h1       = get_h1(content)
    page_label = h1_to_page_label(h1) if h1 else "Repair"

    def replace_block(match):
        raw = match.group(1)
        try:
            data = json.loads(raw)
        except:
            return match.group(0)

        schemas = data if isinstance(data, list) else [data]
        modified = False

        for schema in schemas:
            if schema.get("@type") != "BreadcrumbList":
                continue

            if page_type in ("denver_problem", "brand_city"):
                # Correct 4-item structure: Home → Service Areas → Hub → Page
                schema["itemListElement"] = [
                    {"@type":"ListItem","position":1,"name":"Home",         "item":f"{BASE}/"},
                    {"@type":"ListItem","position":2,"name":"Service Areas","item":f"{BASE}/service-areas"},
                    {"@type":"ListItem","position":3,"name":hub_name,       "item":hub_url},
                    {"@type":"ListItem","position":4,"name":page_label},
                ]
                modified = True

            elif page_type == "city_problem":
                city_slug, city_name, city_url = city_info
                # Correct 5-item: Home → Service Areas → City → Hub → Page
                schema["itemListElement"] = [
                    {"@type":"ListItem","position":1,"name":"Home",         "item":f"{BASE}/"},
                    {"@type":"ListItem","position":2,"name":"Service Areas","item":f"{BASE}/service-areas"},
                    {"@type":"ListItem","position":3,"name":city_name,      "item":city_url},
                    {"@type":"ListItem","position":4,"name":hub_name,       "item":hub_url},
                    {"@type":"ListItem","position":5,"name":page_label},
                ]
                modified = True
            break

        if not modified:
            return match.group(0)

        out = json.dumps(data if isinstance(data, list) else schemas[0],
                         indent=2, ensure_ascii=False)
        return f'<script type="application/ld+json">{out}</script>'

    new_content = re.sub(
        r'<script type="application/ld\+json">(.*?)</script>',
        replace_block, content, flags=re.DOTALL
    )
    return new_content, new_content != content

# ── 2. Title / og:title fix ──────────────────────────────────────────────────

CITY_NAMES_RE = "Denver|Aurora|Arvada|Highlands Ranch|Lakewood|Westminster"

def fix_title(content):
    changed = False

    # Fix <title>: "[Problem] Repair in [City] | Elevate Repair"
    def sub_title(m):
        nonlocal changed
        original = m.group(0)
        fixed = re.sub(
            rf'(\S.*?) Repair in ({CITY_NAMES_RE})( \| Elevate Repair)',
            r'\1 in \2\3',
            original
        )
        fixed = fixed.replace("Shaking Vibrating", "Shaking &amp; Vibrating")
        if fixed != original: changed = True
        return fixed

    content = re.sub(r'<title>[^<]+</title>', sub_title, content)

    # Fix og:title: same pattern but ends with ", CO"
    def sub_og(m):
        nonlocal changed
        original = m.group(0)
        fixed = re.sub(
            rf'(content="[^"]*?) Repair in ({CITY_NAMES_RE})(, CO")',
            r'\1 in \2\3',
            original
        )
        fixed = fixed.replace("Shaking Vibrating", "Shaking &amp; Vibrating")
        if fixed != original: changed = True
        return fixed

    content = re.sub(r'<meta property="og:title"[^>]+>', sub_og, content)

    return content, changed

# ── 3. Meta description overrides ────────────────────────────────────────────

META_OVERRIDES = {
    "dishwasher-repair/dishwasher-wont-start.html":
        "Learn why a dishwasher won't start — door latch failures, blown fuses, control board issues, and power problems. Safe diagnostics and same-day repair in Denver.",
    "fridge-repair/fridge-leaking-water.html":
        "What causes fridge water leaks — defrost drains, supply lines, failed valves. Diagnostics included. Same-day refrigerator repair in Denver.",
    "dishwasher-repair/dishwasher-not-drying.html":
        "Dishes still wet after the cycle? Heating element failure, blocked vents, or rinse aid issues are common causes. Same-day dishwasher repair in Denver.",
    "dryer-repair/dryer-not-heating.html":
        "Why does a dryer run but produce no heat? Heating element, thermal fuse, thermostat, and gas igniter causes explained. Same-day dryer repair in Denver.",
    "oven-repair/oven-temperature-inaccurate.html":
        "Oven running hot, cold, or unevenly? Thermistors, calibration drift, or sensor failure may be the cause. Professional oven repair in Denver, CO.",
    "dryer-repair/dryer-making-noise.html":
        "Learn what causes dryer squealing, thumping, grinding, or rattling — drum rollers, belt, idler pulley, and blower wheel issues covered. Denver dryer repair.",
    "dishwasher-repair/dishwasher-not-cleaning.html":
        "Dishes still dirty after a full cycle? Learn the causes — spray arms, water level, temperature, detergent dispenser. Same-day dishwasher repair in Denver.",
    "washer-repair/washer-leaking-water.html":
        "Washing machine leaking? Torn door seals, failed inlet valves, or loose hoses are common causes. Same-day washer repair in Denver, CO.",
    "washer-repair/washer-shaking-vibrating.html":
        "Washer shaking or vibrating? Unbalanced loads, worn shock absorbers, or loose drum bearings are typical causes. Same-day washer repair in Denver, CO.",
    "dishwasher-repair/dishwasher-making-noise.html":
        "Dishwasher grinding, buzzing, or squealing? Learn the causes — pump motor, spray arm, or foreign object. Safe diagnostics and Denver dishwasher repair.",
    "dishwasher-repair/dishwasher-leaking.html":
        "Dishwasher leaking? Learn what causes it — door seals, hoses, and float switches — and how to find the source. Professional dishwasher repair in Denver.",
    "denver-whirlpool-dryer-not-spinning.html":
        "Whirlpool dryer not spinning? Same-day repair in Denver. Upfront pricing, 60-day warranty. Call Elevate Repair: (720) 575-8432.",
    "dishwasher-repair/dishwasher-wont-drain.html":
        "Dishwasher won't drain? Standing water signals a pump, hose, or valve problem. Learn the causes and how to diagnose. Professional repair in Denver.",
    "oven-repair/oven-door-wont-close.html":
        "Oven door won't close or seal? Broken hinges, worn gaskets, or a stuck latch are common causes. Learn what to inspect and get Denver oven repair.",
    "dryer-repair/dryer-wont-tumble.html":
        "Dryer motor running but drum won't tumble? Broken drive belt, worn rollers, or seized bearings may be the cause. Same-day dryer repair in Denver.",
    "denver-samsung-dryer-not-heating.html":
        "Samsung dryer not heating? Same-day repair in Denver. Upfront pricing, 60-day warranty. Call Elevate Repair: (720) 575-8432.",
    "oven-repair/burner-not-working.html":
        "Gas or electric burner won't light or heat? Clogged ports or failed infinite switches are common causes. Learn what to check and get Denver oven repair.",
    "washer-repair/washer-wont-start.html":
        "Washer won't start? Lid switch failures, door latch issues, or control board faults are common causes. Same-day washer repair in Denver, CO.",
    "oven-repair/oven-wont-turn-off.html":
        "Oven won't turn off? Stuck control board relays or a failed thermostat are the usual causes. Learn the safety steps and get Denver oven repair.",
    "denver-bosch-dryer-not-starting.html":
        "Bosch dryer not starting? Same-day repair in Denver. Upfront pricing, 60-day warranty. Call Elevate Repair: (720) 575-8432.",
    "washer-repair/washer-wont-spin.html":
        "Washer won't spin? Lid switch failures, worn motor couplings, or a failed belt are common causes. Same-day washer repair in Denver, CO.",
    "washer-repair/washer-wont-drain.html":
        "Washer won't drain? Clogged pump filters or a failed drain pump are common causes. Learn what to check and get same-day washer repair in Denver.",
    "denver-miele-dryer-not-heating.html":
        "Miele dryer not heating? Same-day repair in Denver. Upfront pricing, 60-day warranty. Call Elevate Repair: (720) 575-8432.",
    "fridge-repair/ice-maker-not-making-ice.html":
        "Ice maker not producing ice? Water valve failure, freezer temperature, or clogged filters are common causes. Same-day repair in Denver, CO.",
}

def fix_meta_desc(content, relpath):
    if relpath not in META_OVERRIDES:
        return content, False
    new_desc = META_OVERRIDES[relpath]
    new_content = re.sub(
        r'<meta name="description" content="[^"]*">',
        f'<meta name="description" content="{new_desc}">',
        content
    )
    return new_content, new_content != content

# ── main ─────────────────────────────────────────────────────────────────────

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # All problem pages: Denver (40) + city (103) + brand+city (10)
    candidates = (
        glob.glob(os.path.join(root, "denver-*.html")) +
        glob.glob(os.path.join(root, "aurora-*.html")) +
        glob.glob(os.path.join(root, "arvada-*.html")) +
        glob.glob(os.path.join(root, "highlands-ranch-*.html")) +
        glob.glob(os.path.join(root, "lakewood-*.html")) +
        glob.glob(os.path.join(root, "westminster-*.html"))
    )
    # Also meta desc files in subdirs
    subdir_files = [os.path.join(root, p) for p in META_OVERRIDES if "/" in p]

    stats = {"bc_fixed": 0, "title_fixed": 0, "desc_fixed": 0, "files_changed": 0}
    examples = {"bc": [], "title": [], "desc": []}

    all_files = list(set(candidates + subdir_files))

    for fpath in sorted(all_files):
        relpath = os.path.relpath(fpath, root).replace("\\", "/")
        if "tools" in relpath or "repair-denver/" in relpath:
            continue
        if not os.path.exists(fpath):
            continue

        with open(fpath, encoding="utf-8") as f:
            original = f.read()

        content = original
        file_changed = False

        # 1. Breadcrumb
        page_type, brand, city_info, appliance = classify(fpath)
        if page_type:
            content, bc_changed = fix_breadcrumb(content, page_type, brand, city_info, appliance)
            if bc_changed:
                stats["bc_fixed"] += 1
                file_changed = True
                if len(examples["bc"]) < 2:
                    examples["bc"].append(relpath)

        # 2. Title
        content, title_changed = fix_title(content)
        if title_changed:
            stats["title_fixed"] += 1
            file_changed = True
            if len(examples["title"]) < 3:
                # capture before/after
                orig_title = re.search(r'<title>[^<]+</title>', original)
                new_title  = re.search(r'<title>[^<]+</title>', content)
                if orig_title and new_title:
                    examples["title"].append((relpath, orig_title.group(0), new_title.group(0)))

        # 3. Meta description
        content, desc_changed = fix_meta_desc(content, relpath)
        if desc_changed:
            stats["desc_fixed"] += 1
            file_changed = True
            if len(examples["desc"]) < 2:
                examples["desc"].append(relpath)

        if file_changed:
            stats["files_changed"] += 1
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(content)

    print(f"\n=== FIX COMPLETE ===")
    print(f"Files changed:            {stats['files_changed']}")
    print(f"Breadcrumbs fixed:        {stats['bc_fixed']}")
    print(f"Titles fixed:             {stats['title_fixed']}")
    print(f"Meta descriptions fixed:  {stats['desc_fixed']}")
    print(f"\nBreadcrumb examples: {examples['bc']}")
    print(f"\nTitle before/after examples:")
    for path, before, after in examples["title"]:
        print(f"  {path}")
        print(f"    BEFORE: {before}")
        print(f"    AFTER:  {after}")
    print(f"\nMeta desc examples: {examples['desc']}")

if __name__ == "__main__":
    main()
