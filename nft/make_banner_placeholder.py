#!/usr/bin/env python3
"""
Build collection assets for the Taiga NFT set:
  - placeholder.png : the "unrevealed / mystery" NFT (square, body-template style)
  - banner_bg.png   : an API-generated themed banner backdrop (square source)
  - banner.png      : a finished 1500x500 collection banner (backdrop + avatar row + title)

Uses the same OpenRouter image API as generate_nfts.py.
"""
import os, base64, time, requests, glob, random
from pathlib import Path
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL   = os.getenv("OPENROUTER_MODEL", "google/gemini-3.1-flash-image")
FACE    = ROOT / "style_anchor" / "face_calm.jpg"
BODY    = ROOT / "style_anchor" / "body_template.png"
OUT     = ROOT / "collection_assets"; OUT.mkdir(exist_ok=True)
FINAL   = ROOT / "nft_output" / "final_set"

HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json",
           "HTTP-Referer": "https://taigaz.art", "X-Title": "Taiga Assets"}

def b64(p): return base64.b64encode(Path(p).read_bytes()).decode()

def api(prompt, imgs, out):
    content = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64(p)}"}} for p in imgs]
    content.append({"type": "text", "text": prompt.strip()})
    payload = {"model": MODEL, "messages": [{"role": "user", "content": content}]}
    for _ in range(3):
        try:
            r = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=HEADERS, json=payload, timeout=180)
            if r.status_code != 200:
                print("  HTTP", r.status_code, r.text[:150]); time.sleep(2); continue
            msg = r.json()["choices"][0]["message"]
            parts = msg.get("content") if isinstance(msg.get("content"), list) else []
            for part in parts:
                if part.get("type") == "image_url":
                    u = part["image_url"]["url"]
                    data = base64.b64decode(u.split(",",1)[1]) if u.startswith("data:") else requests.get(u).content
                    Path(out).write_bytes(data); print("  ✅", Path(out).name, len(data)//1024,"KB"); return True
            for img in msg.get("images", []) or []:
                u = (img.get("image_url", {}) or {}).get("url") or img.get("url")
                if u:
                    data = base64.b64decode(u.split(",",1)[1]) if u.startswith("data:") else requests.get(u).content
                    Path(out).write_bytes(data); print("  ✅", Path(out).name, len(data)//1024,"KB"); return True
            print("  no image")
        except Exception as e:
            print("  err", e)
        time.sleep(2)
    return False

# ── 1) Placeholder / unrevealed NFT ───────────────────────────────────────────
PLACEHOLDER_PROMPT = """
TWO images. IMAGE 1 = a photo of Taiga (a corgi, identity + warm brown eyes).
IMAGE 2 = the MASTER body template for the collection.

Make the "UNREVEALED / MYSTERY" placeholder card for this NFT collection.
Reproduce IMAGE 2's exact body, pose, framing and crisp chibi Hypurr art style.
Render Taiga as a MAGICAL, GLOWING mystery spirit — NOT a grey/dark shadow.
Her fur is a luminous COLOURFUL translucent aura: iridescent sakura-pink, soft
mauve and mint-teal tones shimmering like the aurora, with a bright glowing rim
light and two warm-brown eyes clearly visible.

ACCESSORIES: the ONLY thing she wears is her red polka-dot BANDANA around the
neck. Absolutely NO crown, NO tiara, NO katana or sword, NO scepter, NO kimono or
robe, NO cape, NO hanging charms — a plain body with just the bandana.

A big softly glowing golden QUESTION-MARK symbol (just the ? shape, not
a letter of text) floats beside her head, with sparkles, cherry-blossom petals
and colourful bokeh.
Background: a dreamy, VIBRANT aurora gradient — teal, periwinkle, soft pink and a
touch of violet — with glowing bokeh and tiny electric sparkles. Bright, magical,
enchanting "coming soon" feel — keep it colourful and luminous, never washed-out
or grey. Perfect 1:1 square.
NO words, NO letters, NO numbers, NO logos, NO watermarks (a single ? glyph is OK).
"""

# ── 2) Banner backdrop (themed background with silhouette characters) ──────────
BANNER_BG_PROMPT = """
Create a WIDE panoramic BACKGROUND artwork for the "Taiga" corgi NFT collection,
in a clean cel-shaded aesthetic. NO text, NO logos, NO characters, NO animals,
NO landscape, NO hills, NO trees.

Keep it SIMPLE and calm: a smooth GREEN / EMERALD gradient background — soft mint
and sage green with a gentle emerald glow / halo of light. On top of it, a light,
airy scatter of: a few soft translucent round BUBBLES (glowing bokeh circles at
different sizes), some drifting pink CHERRY-BLOSSOM petals, and a few small green
LEAVES gently falling. Everything soft, out-of-focus and sparse — plenty of open
green space, not busy. Premium, cohesive, evenly lit.

COMPOSITION: TALL wide banner; keep the upper-middle open and let the bottom
settle into a smooth even green so it can be faded out cleanly.
"""

def greyify_placeholder():
    """Turn the raw mystery render into a faded, grey, blurry 'unrevealed' image."""
    src = OUT / "placeholder_raw.png"
    if not src.exists():                       # fall back to existing asset
        if (OUT / "placeholder.png").exists():
            Image.open(OUT / "placeholder.png").convert("RGB").save(src)
        else:
            print("  no placeholder to process"); return
    from PIL import ImageEnhance
    im = Image.open(src).convert("RGB")
    im = ImageEnhance.Color(im).enhance(0.28)      # heavy desaturate → grey
    im = ImageEnhance.Contrast(im).enhance(0.82)   # flatten
    im = ImageEnhance.Brightness(im).enhance(1.08) # lift toward grey
    im = im.filter(ImageFilter.GaussianBlur(6))    # soft / blurry
    grey = Image.new("RGB", im.size, (148, 150, 156))
    im = Image.blend(im, grey, 0.38)               # push toward neutral grey
    im.save(OUT / "placeholder.png")
    print("  ✅ placeholder.png (greyed + blurred)")

def make_placeholder():
    print("→ placeholder"); api(PLACEHOLDER_PROMPT, [FACE, BODY], OUT / "placeholder_raw.png")
    greyify_placeholder()

# ── corgi silhouette logo (transparent PNG for the HTML header) ────────────────
SILHOUETTE_PROMPT = """
IMAGE = the master body template for a chibi corgi character.
Reproduce its exact body shape and pose, but render it as a SINGLE, SOLID,
PURE-BLACK SILHOUETTE — a flat filled shadow shape, no face, no eyes, no fur
detail, no outline, no shading whatsoever. Pointy ears and fluffy tail clearly
readable.
The silhouette must be a PLAIN corgi ONLY — absolutely NO crown, NO tiara, NO
katana or sword, NO scepter, NO hanging charms, NO clothing or accessories of any
kind. Just the clean bare corgi body outline.
Center it, full body, on a PURE WHITE (#ffffff) background with nothing else.
No text, no ground, no shadow on the floor. Clean crisp edges.
"""

def make_silhouette():
    print("→ silhouette logo")
    raw = OUT / "corgi_logo_raw.png"
    api(SILHOUETTE_PROMPT, [BODY], raw)
    if not raw.exists():
        print("  no silhouette generated"); return
    im = Image.open(raw).convert("RGBA")
    # key out the white background → transparent; keep dark pixels as solid black
    px = im.getdata()
    out = []
    for r, g, b, a in px:
        lum = (r*299 + g*587 + b*114) // 1000
        if lum > 210:                      # near-white → transparent
            out.append((0, 0, 0, 0))
        else:                              # subject → flat black, soft edge by lum
            alpha = 255 if lum < 150 else int((210 - lum) / 60 * 255)
            out.append((20, 28, 26, alpha))
    im.putdata(out)
    im = im.crop(im.getbbox())             # trim to the shape
    im.save(OUT / "corgi_logo.png")
    print("  ✅ corgi_logo.png", im.size)

def make_banner_bg():
    print("→ banner backdrop"); api(BANNER_BG_PROMPT, [FACE], OUT / "banner_bg.png")

def circle(img, size):
    img = ImageOps.fit(img.convert("RGB"), (size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    ring = Image.new("RGBA", (size, size), (0,0,0,0))
    ImageDraw.Draw(ring).ellipse((0,0,size-1,size-1), outline=(255,255,255,255), width=8)
    out = Image.new("RGBA", (size, size), (0,0,0,0)); out.paste(img, (0,0), mask); out.alpha_composite(ring)
    return out

def font(sz, bold=True):
    # Prefer Unbounded (the site's title font) at its heaviest weight.
    unb = ROOT / "style_anchor" / "Unbounded.ttf"
    if unb.exists():
        try:
            f = ImageFont.truetype(str(unb), sz)
            try: f.set_variation_by_name("Black")
            except Exception:
                try: f.set_variation_by_axes([900])
                except Exception: pass
            return f
        except Exception: pass
    for p in ["/System/Library/Fonts/Supplemental/Futura.ttc",
              "/System/Library/Fonts/Avenir Next.ttc",
              "/System/Library/Fonts/Supplemental/Arial Bold.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()

def _round_rect(size, radius, fill):
    im = Image.new("RGBA", size, (0,0,0,0))
    ImageDraw.Draw(im).rounded_rectangle([0,0,size[0]-1,size[1]-1], radius=radius, fill=fill)
    return im

def _bolt_points(p0, p1, jitter, depth):
    """Recursive midpoint-displacement lightning path between two points."""
    if depth == 0:
        return [p0, p1]
    mx = (p0[0] + p1[0]) / 2 + random.uniform(-jitter, jitter)
    my = (p0[1] + p1[1]) / 2 + random.uniform(-jitter, jitter)
    left  = _bolt_points(p0, (mx, my), jitter/2, depth-1)
    right = _bolt_points((mx, my), p1, jitter/2, depth-1)
    return left[:-1] + right

def _draw_bolt(layer, p0, p1, jitter=60, width=3, branch=True):
    pts = _bolt_points(p0, p1, jitter, 5)
    d = ImageDraw.Draw(layer)
    d.line(pts, fill=(180, 250, 255, 255), width=width, joint="curve")
    if branch:
        for i in range(1, len(pts)-1):
            if random.random() < 0.25:
                bx = pts[i][0] + random.uniform(-70, 70)
                by = pts[i][1] + random.uniform(20, 90)
                bp = _bolt_points(pts[i], (bx, by), jitter/2, 3)
                d.line(bp, fill=(160, 240, 255, 220), width=max(1, width-1), joint="curve")

def _electric_layer(W, H, bolts):
    """A transparent layer of glowing lightning arcs."""
    lay = Image.new("RGBA", (W, H), (0,0,0,0))
    for (a, b) in bolts:
        _draw_bolt(lay, a, b, jitter=55, width=3)
    glow = lay.filter(ImageFilter.GaussianBlur(9))
    out = Image.new("RGBA", (W, H), (0,0,0,0))
    out.alpha_composite(glow)          # soft cyan halo
    out.alpha_composite(glow)          # doubled for punch
    out.alpha_composite(lay)           # crisp white-cyan core
    return out

def build_banner(W=1500, H=720):
    random.seed(7)                     # stable, repeatable lightning
    # backdrop
    if (OUT / "banner_bg.png").exists():
        bg = ImageOps.fit(Image.open(OUT / "banner_bg.png").convert("RGB"), (W, H), Image.LANCZOS)
    else:
        bg = Image.new("RGB", (W, H), (170, 190, 185))
    banner = bg.convert("RGBA")

    # (Lightning removed — the simple bubbles/blossom/leaf backdrop is kept calm.)

    # Title text is NOT drawn here — the "TAIGAZ" wordmark is overlaid in HTML
    # so it can use the live web font + animated electric styling.

    banner.convert("RGB").save(OUT / "banner.png")
    print("  ✅ banner.png", (W,H))

if __name__ == "__main__":
    import sys
    if "--recompose" in sys.argv:          # rebuild from existing bg, no API
        build_banner(); print("done →", OUT)
    else:
        if "--banner-only" not in sys.argv:
            make_placeholder()
        make_banner_bg()
        build_banner()
        print("done →", OUT)
