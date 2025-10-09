#!/usr/bin/env python3
import json
import os
import re
import sys
from datetime import datetime, timezone

try:
    import requests
    from bs4 import BeautifulSoup  # type: ignore
except Exception as e:
    sys.stderr.write(
        "Missing dependencies. Please install with: pip install requests beautifulsoup4\n"
    )
    raise


AWS_DOCS_URL = (
    "https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html"
)


def extract_region_codes(cell_text: str) -> list[str]:
    # Normalize whitespace and remove asterisks
    text = re.sub(r"\s+", " ", cell_text.replace("*", " "))
    # Find region-like tokens (supports gov partitions)
    pattern = re.compile(r"\b[a-z]{2}-[a-z0-9-]+-\d\b|\bus-gov-[a-z-]+-\d\b")
    regions = pattern.findall(text)
    # Deduplicate while preserving order
    seen = set()
    ordered = []
    for r in regions:
        if r not in seen:
            seen.add(r)
            ordered.append(r)
    return ordered


def scrape_catalog() -> dict:
    resp = requests.get(AWS_DOCS_URL, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table")
    if not table:
        raise RuntimeError("Could not find models table on the AWS documentation page.")

    models = []
    all_regions = set()

    for tr in table.find_all("tr"):
        ths = tr.find_all("th")
        if ths:
            # header row
            continue
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue

        provider = tds[0].get_text(strip=True)
        model_name = tds[1].get_text(strip=True)
        model_id = tds[2].get_text(strip=True)
        regions_supported = extract_region_codes(tds[3].get_text(" ", strip=True))

        for r in regions_supported:
            all_regions.add(r)

        models.append(
            {
                "provider": provider,
                "model_name": model_name,
                "model_id": model_id,
                "regions": regions_supported,
            }
        )

    catalog = {
        "source_url": AWS_DOCS_URL,
        "last_updated_utc": datetime.now(timezone.utc).isoformat(),
        "models": models,
        "regions": sorted(all_regions),
    }
    return catalog


def main() -> int:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Write to Next.js public/ so it is served at /data/bedrock_models.json
    output_dir = os.path.join(repo_root, "public", "data")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "bedrock_models.json")

    catalog = scrape_catalog()
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(catalog['models'])} models and {len(catalog['regions'])} regions to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

