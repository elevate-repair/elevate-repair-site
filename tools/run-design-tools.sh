#!/bin/sh
# Every shared design layer of the Denver pages, in dependency order.
#
#   sh tools/run-design-tools.sh           render every layer (after editing a JSON file, a template
#                                          or adding pages with tools/generate-problem-pages.mjs or
#                                          tools/generate_seo_pages.py)
#   sh tools/run-design-tools.sh --check   check every layer, exit 1 on the first drift (CI)
#
# Needs node and python3 with Pillow (WebP support) for the image exports.
set -e
MODE="$1"
cd "$(dirname "$0")/.."

python3 tools/export-denver-images.py $MODE
node tools/apply-hero-offers.mjs $MODE
node tools/apply-appliance-cards.mjs $MODE
node tools/apply-gallery.mjs $MODE
node tools/apply-page-photos.mjs $MODE
node tools/apply-brand-logos.mjs $MODE
node tools/apply-area-cards.mjs $MODE
node tools/apply-faq-accordion.js $MODE
node tools/sync-faq-schema.js $MODE
node tools/apply-natural-headings.mjs $MODE
node tools/apply-estimates.mjs $MODE
node tools/generate-repair-guides.mjs $MODE
# the hubs' $300 callout links #repair-cost once the estimates exist
node tools/apply-hero-offers.mjs $MODE
