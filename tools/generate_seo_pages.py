#!/usr/bin/env python3
"""
SEO Page Generator for Elevate Repair
======================================
Generates static HTML pages using OpenAI API based on a plan JSON file.
Uses a template with marker blocks for content injection.

Usage:
    python3 tools/generate_seo_pages.py --plan tools/seo_plan_top20.json --template tools/template_city_base.html --limit 20 --dry-run
    python3 tools/generate_seo_pages.py --plan tools/seo_plan_top20.json --template tools/template_city_base.html --limit 20
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Required marker pairs in the template
REQUIRED_MARKERS = [
    ("<!-- SEO_TITLE -->", "<!-- /SEO_TITLE -->"),
    ("<!-- SEO_META_DESCRIPTION -->", "<!-- /SEO_META_DESCRIPTION -->"),
    ("<!-- SEO_H1 -->", "<!-- /SEO_H1 -->"),
    ("<!-- SEO_INTRO -->", "<!-- /SEO_INTRO -->"),
    ("<!-- SEO_BODY -->", "<!-- /SEO_BODY -->"),
]


def validate_template(template_content):
    """Validate that all required markers exist in the template. Exit if any are missing."""
    missing = []
    for open_marker, close_marker in REQUIRED_MARKERS:
        if open_marker not in template_content:
            missing.append(open_marker)
        if close_marker not in template_content:
            missing.append(close_marker)
    if missing:
        print("ERROR: Template is missing required markers:", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        sys.exit(1)
    print("  Template markers validated OK")


def load_plan(plan_path):
    """Load and validate the plan JSON."""
    with open(plan_path, "r") as f:
        plan = json.load(f)
    if not isinstance(plan, list):
        print("ERROR: Plan JSON must be a top-level array.", file=sys.stderr)
        sys.exit(1)
    required_keys = {"city", "city_slug", "category", "appliance_slug", "problem", "problem_slug", "output_filename", "parent_page"}
    for i, entry in enumerate(plan):
        missing_keys = required_keys - set(entry.keys())
        if missing_keys:
            print(f"ERROR: Plan entry {i} missing keys: {missing_keys}", file=sys.stderr)
            sys.exit(1)
    return plan


def load_prompt_template(prompt_path):
    """Load the prompt template file."""
    with open(prompt_path, "r") as f:
        return f.read()


def build_prompt(prompt_template, entry):
    """Build a prompt for one page from the template and plan entry."""
    replacements = {
        "{city}": entry["city"],
        "{category}": entry["category"],
        "{problem}": entry["problem"],
        "{parent_page}": entry["parent_page"],
        "{category_lower}": entry["category"].lower(),
        "{problem_lower}": entry["problem"].lower(),
    }
    result = prompt_template
    for key, value in replacements.items():
        result = result.replace(key, value)
    return result


def call_openai(prompt, model="gpt-4o"):
    """Call OpenAI Chat Completions API. Returns the assistant message content."""
    import requests

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise EnvironmentError("OPENAI_API_KEY environment variable is not set.")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an expert SEO content writer for a local appliance repair company. "
                    "Write unique, helpful, accurate content. Follow the output format exactly. "
                    "Do not wrap output in code fences. Output raw text and HTML as instructed."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.75,
        "max_tokens": 3000,
    }

    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def parse_openai_response(response_text):
    """Parse the structured response into title, description, h1, intro, body."""
    sections = {}

    # Extract each labeled section
    patterns = [
        ("title", r"^TITLE:\s*(.+?)(?=\nDESCRIPTION:)", re.DOTALL | re.MULTILINE),
        ("description", r"^DESCRIPTION:\s*(.+?)(?=\nH1:)", re.DOTALL | re.MULTILINE),
        ("h1", r"^H1:\s*(.+?)(?=\nINTRO:)", re.DOTALL | re.MULTILINE),
        ("intro", r"^INTRO:\s*(.+?)(?=\nBODY:)", re.DOTALL | re.MULTILINE),
        ("body", r"^BODY:\s*(.+)", re.DOTALL | re.MULTILINE),
    ]

    for key, pattern, flags in patterns:
        match = re.search(pattern, response_text, flags)
        if match:
            sections[key] = match.group(1).strip()
        else:
            sections[key] = ""

    return sections


def replace_marker_block(html, open_marker, close_marker, new_content):
    """Replace content between marker comments, preserving the markers themselves."""
    pattern = re.escape(open_marker) + r".*?" + re.escape(close_marker)
    replacement = open_marker + new_content + close_marker
    return re.sub(pattern, replacement, html, count=1, flags=re.DOTALL)


def replace_city_references(html, target_city, target_slug):
    """Replace Cherry Creek references outside of nav/header/footer with target city.

    This handles section headings, mid-CTA text, form headings, hidden field values,
    and other city-specific text in the template that falls outside the marker blocks.
    """
    # Replace the visible city name in non-nav, non-footer sections
    # These are the hardcoded Cherry Creek references in the template body
    replacements = [
        # Services section heading
        ("Appliance Repair Services in Cherry Creek", f"Appliance Repair Services in {target_city}"),
        # Services section intro
        ("We cover Cherry Creek North, Cherry Creek South, and all surrounding blocks between University Boulevard and Colorado Boulevard.",
         f"We provide full appliance repair coverage throughout {target_city} and surrounding neighborhoods."),
        # Mid CTA
        ("Same-day appointments available in Cherry Creek.", f"Same-day appointments available in {target_city}."),
        # Form section heading
        ("Schedule Appliance Repair in Cherry Creek", f"Schedule Appliance Repair in {target_city}"),
        # Form hidden field
        ('value="website-cherry-creek"', f'value="website-{target_slug}"'),
        # Area cards heading
        ("Appliance Repair Near Cherry Creek", f"Appliance Repair Near {target_city}"),
        # Brands heading
        ("Appliance Brands We Service in Cherry Creek", f"Appliance Brands We Service in {target_city}"),
        # Final CTA heading
        ("Need Appliance Repair in Cherry Creek?", f"Need Appliance Repair in {target_city}?"),
    ]

    for old, new in replacements:
        html = html.replace(old, new)

    return html


def inject_content(template_html, sections, entry):
    """Inject parsed content into the template using marker blocks, then fix city refs."""
    html = template_html

    # 1. Replace marker blocks
    html = replace_marker_block(
        html, "<!-- SEO_TITLE -->", "<!-- /SEO_TITLE -->",
        sections.get("title", "")
    )
    html = replace_marker_block(
        html, "<!-- SEO_META_DESCRIPTION -->", "<!-- /SEO_META_DESCRIPTION -->",
        sections.get("description", "")
    )
    html = replace_marker_block(
        html, "<!-- SEO_H1 -->", "<!-- /SEO_H1 -->",
        f'<h1>{sections.get("h1", "")}</h1>'
    )
    html = replace_marker_block(
        html, "<!-- SEO_INTRO -->", "<!-- /SEO_INTRO -->",
        f'\n            <p class="hero-text">{sections.get("intro", "")}</p>\n            '
    )
    html = replace_marker_block(
        html, "<!-- SEO_BODY -->", "<!-- /SEO_BODY -->",
        f'\n            <div class="content-body">\n{sections.get("body", "")}\n            </div>\n            '
    )

    # 2. Replace city references outside markers
    html = replace_city_references(html, entry["city"], entry["city_slug"])

    return html


def validate_output(html, entry):
    """Validate generated HTML for common issues. Returns list of error strings."""
    errors = []

    # Check for Cherry Creek leakage
    if entry["city"] != "Cherry Creek":
        # Only check outside of nav/footer (which legitimately reference Cherry Creek)
        # Extract the main content area between </header> and <footer
        main_match = re.search(r"</header>(.*)<footer", html, re.DOTALL)
        if main_match:
            main_content = main_match.group(1)
            # Exclude nav links that reference cherry-creek.html
            cleaned = re.sub(r'href="/cherry-creek\.html"', "", main_content)
            if "Cherry Creek" in cleaned:
                errors.append(f"Cherry Creek reference found in {entry['city']} page content")

    # Check for merge conflict markers
    if "<<<<<<" in html or "=======" in html and ">>>>>>>" in html:
        errors.append("Merge conflict markers detected")

    # Check that markers are present (template integrity)
    for open_marker, _ in REQUIRED_MARKERS:
        if open_marker not in html:
            errors.append(f"Missing marker: {open_marker}")

    return errors


def check_duplicates(created_files):
    """Check for duplicate paragraphs across generated files."""
    paragraph_hashes = {}  # hash -> (filename, paragraph_text)
    duplicates = []

    for filepath in created_files:
        with open(filepath, "r") as f:
            content = f.read()

        # Extract paragraphs from the SEO_BODY section only
        body_match = re.search(r"<!-- SEO_BODY -->(.+?)<!-- /SEO_BODY -->", content, re.DOTALL)
        if not body_match:
            continue

        paragraphs = re.findall(r"<p>(.*?)</p>", body_match.group(1), re.DOTALL)

        for para in paragraphs:
            clean = re.sub(r"<[^>]+>", "", para).strip()
            if len(clean) < 80:
                continue  # Skip short paragraphs (CTAs, links, etc.)

            h = hashlib.md5(clean.encode()).hexdigest()

            if h in paragraph_hashes:
                other_file = paragraph_hashes[h][0]
                if other_file != str(filepath):
                    duplicates.append({
                        "file1": other_file,
                        "file2": str(filepath),
                        "paragraph_preview": clean[:100] + "...",
                    })
            else:
                paragraph_hashes[h] = (str(filepath), clean)

    return duplicates


def update_sitemap(created_files):
    """Append new URLs to sitemap.xml (append-only, before </urlset>)."""
    sitemap_path = REPO_ROOT / "sitemap.xml"
    if not sitemap_path.exists():
        print("  WARNING: sitemap.xml not found, skipping sitemap update")
        return

    with open(sitemap_path, "r") as f:
        sitemap = f.read()

    close_tag = "</urlset>"
    if close_tag not in sitemap:
        print("  WARNING: </urlset> not found in sitemap.xml, skipping")
        return

    today = time.strftime("%Y-%m-%d")
    new_entries = []

    for filepath in created_files:
        filename = Path(filepath).name
        # Check if already in sitemap
        if filename in sitemap:
            continue
        entry = f"""  <url>
    <loc>https://www.elevaterepair.com/{filename}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>"""
        new_entries.append(entry)

    if not new_entries:
        print("  All files already in sitemap, nothing to append")
        return

    insertion = "\n".join(new_entries) + "\n"
    sitemap = sitemap.replace(close_tag, insertion + close_tag)

    with open(sitemap_path, "w") as f:
        f.write(sitemap)

    print(f"  Appended {len(new_entries)} new URLs to sitemap.xml")


def main():
    parser = argparse.ArgumentParser(description="Generate SEO pages for Elevate Repair")
    parser.add_argument("--plan", required=True, help="Path to plan JSON file")
    parser.add_argument("--template", required=True, help="Path to HTML template file")
    parser.add_argument("--prompt", default=str(REPO_ROOT / "tools" / "prompt_templates" / "page_prompt.txt"),
                        help="Path to prompt template file")
    parser.add_argument("--limit", type=int, default=20, help="Maximum number of pages to generate")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be generated without making API calls")
    parser.add_argument("--model", default="gpt-4o", help="OpenAI model to use (default: gpt-4o)")
    args = parser.parse_args()

    print("=" * 60)
    print("  Elevate Repair — SEO Page Generator")
    print("=" * 60)

    # ── Load & validate ────────────────────────────────────────
    print("\n[1/6] Loading configuration...")

    plan_path = Path(args.plan)
    if not plan_path.is_absolute():
        plan_path = REPO_ROOT / plan_path
    plan = load_plan(plan_path)
    print(f"  Loaded plan: {len(plan)} pages defined")

    template_path = Path(args.template)
    if not template_path.is_absolute():
        template_path = REPO_ROOT / template_path
    with open(template_path, "r") as f:
        template_html = f.read()

    print(f"  Loaded template: {template_path.name}")
    validate_template(template_html)

    prompt_path = Path(args.prompt)
    if not prompt_path.is_absolute():
        prompt_path = REPO_ROOT / prompt_path
    prompt_template = load_prompt_template(prompt_path)
    print(f"  Loaded prompt template: {prompt_path.name}")

    if not args.dry_run:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            print("\nERROR: OPENAI_API_KEY environment variable is not set.", file=sys.stderr)
            sys.exit(1)
        print(f"  API key: ...{api_key[-4:]}")
        print(f"  Model: {args.model}")

    # ── Process pages ──────────────────────────────────────────
    entries = plan[: args.limit]
    print(f"\n[2/6] Processing {len(entries)} pages (limit={args.limit})...\n")

    created = []
    skipped = []
    errors = []

    for i, entry in enumerate(entries, 1):
        filename = entry["output_filename"]
        output_path = REPO_ROOT / filename
        label = f"  [{i:2d}/{len(entries)}] {filename}"

        # Skip if exists
        if output_path.exists():
            print(f"{label} — SKIPPED (file exists)")
            skipped.append(filename)
            continue

        if args.dry_run:
            prompt = build_prompt(prompt_template, entry)
            print(f"{label} — DRY RUN")
            print(f"         City: {entry['city']}, Appliance: {entry['category']}, Problem: {entry['problem']}")
            print(f"         Parent: {entry['parent_page']}")
            print(f"         Prompt length: {len(prompt)} chars")
            continue

        # Generate via API
        try:
            print(f"{label} — generating...", end="", flush=True)
            prompt = build_prompt(prompt_template, entry)
            response_text = call_openai(prompt, model=args.model)
            sections = parse_openai_response(response_text)

            # Check parsing
            missing_sections = [k for k in ("title", "description", "h1", "intro", "body") if not sections.get(k)]
            if missing_sections:
                print(f" ERROR (missing sections: {missing_sections})")
                errors.append({"file": filename, "error": f"Missing sections: {missing_sections}"})
                continue

            # Inject into template
            html = inject_content(template_html, sections, entry)

            # Validate
            validation_errors = validate_output(html, entry)
            if validation_errors:
                print(f" ERROR")
                for ve in validation_errors:
                    print(f"         {ve}")
                errors.append({"file": filename, "error": "; ".join(validation_errors)})
                continue

            # Write file
            with open(output_path, "w") as f:
                f.write(html)

            word_count = len(re.sub(r"<[^>]+>", "", sections["body"]).split())
            print(f" OK ({word_count} words)")
            created.append(str(output_path))

            # Rate limit: small delay between API calls
            if i < len(entries):
                time.sleep(1)

        except Exception as e:
            print(f" ERROR: {e}")
            errors.append({"file": filename, "error": str(e)})

    # ── Dry run summary ────────────────────────────────────────
    if args.dry_run:
        print(f"\n[DRY RUN COMPLETE]")
        print(f"  Would generate: {len(entries) - len(skipped)} pages")
        print(f"  Would skip: {len(skipped)} pages (already exist)")
        print("\nTo run for real, remove the --dry-run flag.")
        return 0

    # ── Duplicate detection ────────────────────────────────────
    print(f"\n[3/6] Checking for duplicate paragraphs...")
    if created:
        duplicates = check_duplicates(created)
        if duplicates:
            print(f"  WARNING: {len(duplicates)} duplicate paragraph(s) found:")
            for dup in duplicates[:10]:
                print(f"    {Path(dup['file1']).name} <-> {Path(dup['file2']).name}")
                print(f"      \"{dup['paragraph_preview']}\"")
        else:
            print("  No duplicates detected")
    else:
        print("  No files to check")

    # ── Sitemap update ─────────────────────────────────────────
    print(f"\n[4/6] Updating sitemap.xml...")
    if created:
        update_sitemap(created)
    else:
        print("  No new files to add")

    # ── Summary ────────────────────────────────────────────────
    print(f"\n[5/6] Summary")
    print("-" * 40)
    print(f"  Created:  {len(created)}")
    for f in created:
        print(f"    + {Path(f).name}")
    print(f"  Skipped:  {len(skipped)}")
    for f in skipped:
        print(f"    ~ {f}")
    print(f"  Errors:   {len(errors)}")
    for e in errors:
        print(f"    ! {e['file']}: {e['error']}")

    # ── Terminal commands ──────────────────────────────────────
    print(f"\n[6/6] Done!")

    if errors:
        print(f"\nExiting with error code 1 ({len(errors)} error(s))")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
