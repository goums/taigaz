#!/usr/bin/env python3
"""Generate ERC-721 metadata JSON for the Taigaz wedding collection.

Outputs one file per pool design (0.json .. 15.json) plus golden.json into
frontend/public/metadata/ (served by Vercel), matching the URIs set on-chain by
script/Configure.s.sol (`${BASE_URI}/${id}.json`).

Configure hosting roots via env (or edit the defaults below):
  BASE_URI    where the JSON files are served (default https://taigaz.vercel.app/metadata)
  IMAGE_BASE  where the PNG images are served (default https://taigaz.vercel.app/nft)
"""
import json
import os

COLLECTION = "Taigaz"
BASE_URI = os.environ.get("BASE_URI", "https://taigaz.vercel.app/metadata").rstrip("/")
IMAGE_BASE = os.environ.get(
    "IMAGE_BASE", "https://taigaz.vercel.app/nft"
).rstrip("/")
# Metadata is served by Vercel out of the frontend's public/ directory.
OUT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "metadata")
)

# id -> (image filename, display name, rarity, selection weight)
POOL = {
    0:  ("02_samurai.png",       "Samurai",       "Epic",   30),
    1:  ("03_martial_art.png",   "Martial Art",   "Common", 100),
    2:  ("04_cheerleader.png",   "Cheerleader",   "Rare",   60),
    3:  ("05_baby.png",          "Baby",          "Rare",   60),
    4:  ("06_books.png",         "Books",         "Common", 100),
    5:  ("07_bretonne.png",      "Bretonne",      "Common", 100),
    6:  ("08_lyon.png",          "Lyon",          "Common", 100),
    7:  ("09_karaoke_kpop.png",  "Karaoke K-Pop", "Rare",   60),
    8:  ("10_cooking.png",       "Cooking",       "Common", 100),
    9:  ("11_kimono.png",        "Kimono",        "Epic",   30),
    10: ("12_hacker.png",        "Hacker",        "Rare",   60),
    11: ("13_aviator.png",       "Aviator",       "Rare",   60),
    12: ("14_blueprint.png",     "Blueprint",     "Rare",   60),
    13: ("15_gaming.png",        "Gaming",        "Common", 100),
    14: ("16_ramen.png",         "Ramen",         "Common", 100),
    15: ("17_fitness.png",       "Fitness",       "Common", 100),
}

GOLDEN = ("01_golden_queen.png", "Golden Queen", "Legendary")

DESCRIPTION = (
    "A commemorative NFT from the Taigaz wedding collection. "
    "Collect one of every design to complete the set."
)


def meta(name, image_file, rarity):
    return {
        "name": f"{COLLECTION} — {name}",
        "description": DESCRIPTION,
        "image": f"{IMAGE_BASE}/{image_file}",
        "collection": COLLECTION,
        "attributes": [
            {"trait_type": "Design", "value": name},
            {"trait_type": "Rarity", "value": rarity},
        ],
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    for design_id, (img, name, rarity, _weight) in POOL.items():
        path = os.path.join(OUT_DIR, f"{design_id}.json")
        with open(path, "w") as f:
            json.dump(meta(name, img, rarity), f, indent=2, ensure_ascii=False)

    g_img, g_name, g_rarity = GOLDEN
    with open(os.path.join(OUT_DIR, "golden.json"), "w") as f:
        json.dump(meta(g_name, g_img, g_rarity), f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(POOL) + 1} metadata files to {OUT_DIR}")
    print(f"  JSON base : {BASE_URI}/<id>.json")
    print(f"  Image base: {IMAGE_BASE}/<file>.png")


if __name__ == "__main__":
    main()
