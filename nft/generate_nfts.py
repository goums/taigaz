#!/usr/bin/env python3
"""
Taiga Corgi NFT Generator  (v2)
================================
Generates a homogeneous 10-piece NFT collection of "Taiga", a cute female
Pembroke Welsh Corgi, in the Hypurr NFT art style, on a uniform deep
forest-green background (Golden Queen uses a shiny golden background).

Homogeneity strategy
---------------------
1.  A single hardened BASE_STYLE block locks the Hypurr look + corgi identity.
2.  Every generation is conditioned on TWO reference images:
        - the real photo of Taiga  -> fur colours / markings / face
        - a locked STYLE ANCHOR    -> art style, line weight, shading,
                                      eye rendering, framing AND the exact
                                      green background.
    This keeps character + style + background consistent across all cards.

Usage
-----
    python generate_nfts.py                 # generate every missing NFT
    python generate_nfts.py 02 05 10        # generate only these numbers
    python generate_nfts.py --force 03      # re-generate even if it exists
    python generate_nfts.py --anchor        # (re)generate the style anchor
    python generate_nfts.py --no-anchor ... # generate WITHOUT anchor image
"""

import os
import sys
import base64
import time
import requests
from pathlib import Path
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL   = os.getenv("OPENROUTER_MODEL", "google/gemini-3.1-flash-image")
if not API_KEY:
    sys.exit("❌  OPENROUTER_API_KEY missing from .env")

ROOT        = Path(__file__).parent
OUTPUT_DIR  = ROOT / "nft_output"
REF_IMAGE   = ROOT / "style_anchor" / "face_calm.jpg"   # tight face crop
ANCHOR_IMG  = ROOT / "style_anchor" / "anchor.png"   # locked character anchor
BODY_TEMPLATE = ROOT / "style_anchor" / "body_template.png"  # fixed body/pose
HYPURR_DIR  = ROOT / "ref hypurr converted"           # per-card style templates
OUTPUT_DIR.mkdir(exist_ok=True)
ANCHOR_IMG.parent.mkdir(exist_ok=True)


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("utf-8")


REF_B64 = b64(REF_IMAGE)

# ── Shared style tokens ───────────────────────────────────────────────────────
BASE_STYLE = """
2D vector anime NFT profile-picture, drawn EXACTLY in the "Hypurr" NFT
collection art style: a clean, premium, CHIBI cel-shaded kawaii vector mascot.

CHARACTER — "Taiga", a cute female Pembroke Welsh Corgi (ALWAYS a corgi, NEVER
a cat):
  - Warm golden-tan / honey fur with a crisp WHITE chest and WHITE muzzle, and a
    WHITE blaze stripe running up the muzzle between the eyes.
  - LARGE, sharply TRIANGULAR, erect pointed corgi ears: golden-tan outside with
    soft pink inner lining.
  - Small black button nose; fluffy corgi tail curling up on one side.

HYPURR FACE & RENDERING (match precisely — this is the important part):
  - A fairly flat, expressive face that is a bit SLIM and refined (not overly
    chubby-round), with a SHORT, barely-protruding muzzle so the LARGE eyes and
    the expression still fill most of the face. NOT a long realistic dog snout.
  - EYES: large, round, glossy anime eyes with a warm BROWN iris, a big dark
    pupil and TWO bright white sparkle highlights — the collection's signature
    "eye sparkle".
  - LINEWORK: FINE, light, delicate dark lines — thin and elegant, clearly NOT
    heavy or bold, no thick sticker border.
  - FUR: SIMPLE and smooth — clean flat colour areas with only a few soft
    cel-shading shapes, cool blue-grey shadows on the white fur, a soft cyan rim
    light and just a couple of gentle cheek tufts. NOT densely detailed, NOT
    heavily textured.
  - Big-head / small-body CHIBI proportions; polished, premium finish.

POSTURE & FRAMING:
  - ANTHROPOMORPHIC: draw her upright and HUMAN-LIKE (human torso, shoulders,
    arms and expressive hands/paws), posed like a little person — never on all
    fours.
  - 3/4 VIEW (important, like every Hypurr piece): her BODY is TURNED to one
    side, shoulders at an angle with one shoulder nearer the viewer, and her head
    turned roughly 3/4 toward the camera with a slight tilt. This is a dynamic,
    styled angle — NOT a flat, symmetrical, dead-on front-facing pose.
  - Half-body bust, with comfortable breathing room; head in the upper portion of
    the frame, hands and props may extend BEYOND the silhouette (slung over a
    shoulder, behind her, or with small dangling charms). NOT a tight face
    close-up.

REDRAW: fully re-draw her as a NEW stylised vector illustration; use the photo
ONLY as a likeness guide for her markings, never trace it or keep its realistic
fur texture, collar/tag/bandana, lighting or setting. Replace the whole
background as specified below.

STRICTLY FORBIDDEN: any text, letters, numbers, words, logos, watermarks,
signatures, captions, borders/frames, or AI-slop artifacts.
"""


def hbg(tone: str, ambient: str = "") -> str:
    """A Hypurr-style backdrop: a muted, desaturated tone with a soft vignette."""
    return f"""
BACKGROUND — Hypurr-style backdrop (muted, desaturated, premium — exactly like
the real Hypurr NFT backgrounds):
{tone}
Keep it clean and simple: a single muted colour with a soft, subtle radial glow
/ vignette so the character pops in front. No scenery, no furniture, no text.
{ambient}
"""


# Reusable Hypurr background tones (all muted / desaturated).
SLATE      = "A flat dusty slate blue-grey (hex #9fb0c0)."
PERIWINKLE = "A soft muted periwinkle blue (hex #93a6cf)."
TEAL_LT    = "A muted soft teal (hex #6fb6ad)."
TEAL_DK    = "A deep muted teal-green (hex #2f5d54)."
MINT       = "A soft pale muted mint (hex #a9d3c8)."
LILAC      = "A soft muted lilac / lavender (hex #b6a6d6)."
SAKURA     = "A soft muted sakura pink-to-cream pastel gradient (from #e3c0cf to #f2e2d5)."
ROSE       = "A warm muted dusty rose / blush (hex #d8b8b8)."
SKY        = "A soft muted sky slate-blue (hex #9bb6cf)."

# Golden Queen keeps a richer, luminous take for the legendary 1/1.
QUEEN_BG = """
BACKGROUND — legendary 1/1, Hypurr-style but elevated:
A soft luminous lilac-to-warm-peach pastel gradient (from #c9b3e2 to #f3d8c6),
with gently drifting pale petals and a subtle golden shimmer / bokeh sparkle
around her — regal, dreamy and premium. No scenery, no text.
"""

# The Hypurr NFT used only to SEED the style anchor's rendering.
ANCHOR_STYLE_SEED = ROOT / "ref hypurr converted" / "hypurr5.png"

# Note injected when minting the anchor (IMAGE 2 = a real Hypurr NFT).
ANCHOR_SEED_NOTE = """
IMAGE 2 is a real "Hypurr" NFT = the STYLE TARGET. Copy its art style, line
weight, cel-shading, the large glossy sparkle-eyes, the flat round face and the
chibi proportions EXACTLY — but NOT its outfit, props or background. The subject
stays Taiga the corgi from IMAGE 1.
"""

# Instructions injected into every CARD.
# IMAGE 1 = photo (identity), IMAGE 2 = our character anchor, IMAGE 3 = per-card
# Hypurr template (pose / composition / rendering).
ANCHOR_NOTE = """
REFERENCE IMAGES (three):
  - IMAGE 1 = a photo of the real dog Taiga. Use ONLY for her fur colours and
    tan/white markings.
  - IMAGE 2 = Taiga's OFFICIAL CHARACTER ANCHOR (our canonical corgi): warm BROWN
    glossy sparkle-eyes, a slim expressive face, sharp triangular ears, fine-line
    premium Hypurr rendering. Keep her looking EXACTLY like this character.
  - IMAGE 3 = a real Hypurr NFT used as the POSE / COMPOSITION / RENDERING template
    for THIS card. Copy its dynamic 3/4 body angle, framing, how it holds or wears
    things, and its authentic Hypurr finish — BUT completely REPLACE its outfit,
    hat, accessories, held items and background with the theme described below.
    Never copy the reference's cat face or species: the subject is always Taiga
    the corgi from images 1–2. Drop the red bandana whenever the costume covers
    the neck.
"""

# Theme text for minting the style anchor (BASE_STYLE + seed note added at call).
ANCHOR_PROMPT = f"""
Theme: the definitive BASE portrait of Taiga. Dress her in a FASHIONABLE, stylish
modern outfit — a trendy well-tailored jacket (chic streetwear / editorial), NOT
a cozy knit sweater. Her body is clearly TURNED at a 3/4 angle with one shoulder
toward the viewer, head turned 3/4 with a confident slight tilt; a chill,
self-assured half-smile; eyes big and glossy with clear teal sparkle highlights.
This image defines the collection's canonical style and angle.
{hbg(SLATE, "A few faint soft bokeh light dots for gentle depth.")}
"""

# ── NFT definitions ───────────────────────────────────────────────────────────
# Each card gets its own EXPRESSION, a green-family background variant with
# thematic ambient particles, and richer silhouette-breaking props/details.
NFTS = [
    {
        "num": "01", "filename": "01_golden_queen.png", "theme": "Golden Queen",
        "bg": QUEEN_BG,
        "expression": "serene, classy and regal — chin lifted slightly, a poised "
                      "confident half-smile, eyes calm and radiant.",
        "prompt": """
Theme: Golden Queen — the legendary shiny 1-of-1 of the collection.
  - A delicate ornate golden crown with glinting gem accents on her head, tiny
    dangling jewelled drops.
  - Regal golden royal robe / cape with fine filigree embroidery, an ermine-style
    trim and a jewelled collar brooch.
  - A slender golden sceptre resting against one shoulder (extending past the
    silhouette) topped with a small glowing gem.
  - Warm golden rim light along her fur edges (overriding the usual cyan);
    faint golden glow reflecting on her.
""",
    },
    {
        "num": "02", "filename": "02_samurai.png", "theme": "Samurai",
        "bg": hbg(TEAL_DK,
                  "A few soft pale-pink cherry-blossom petals drift, blurred for depth."),
        "expression": "calm, cool and quietly confident — a small composed smirk, "
                      "steady half-lidded eyes.",
        "prompt": """
Theme: Samurai warrior.
  - Ornate traditional Japanese tosei-gusoku armour: deep red lacquered chest
    plate (do) with golden trim and shoulder guards (osode), fine silk cords.
  - Kabuto helmet with an iconic golden crescent kuwagata crest and a small
    decorative tassel.
  - A sheathed katana held at her side, its handle wrapped in diamond cord, a
    little braided tassel dangling from the hilt; the sheath extends past her
    silhouette.
  - A single cherry-blossom sprig tucked near the shoulder for a delicate touch.
""",
    },
    {
        "num": "03", "filename": "03_martial_art.png", "theme": "Martial Art",
        "bg": hbg(SLATE,
                  "A couple of very faint soft spark motes, subtle."),
        "expression": "cheerful and determined — bright confident smile, "
                      "spirited sparkling eyes.",
        "prompt": """
Theme: Judo martial artist.
  - Clean bright white judo gi (judogi) with subtly rumpled, well-drawn folds.
  - Black belt (kuro obi) tied neatly at the waist, ends hanging.
  - One paw raised in a ready guard; a small shiny gold champion medal on a
    ribbon around her neck.
  - A white gym towel draped over one shoulder, extending past the silhouette.
""",
    },
    {
        "num": "04", "filename": "04_cheerleader.png", "theme": "Cheerleader",
        "bg": hbg(TEAL_LT,
                  "A few tiny confetti bits and soft white star bokeh float around, blurred."),
        "expression": "big joyful OPEN smile with a little tongue, cheeks rosy, "
                      "eyes shining with excitement — full of energy.",
        "prompt": """
Theme: Cheerleader.
  - Cheer uniform: white top with forest-green and gold trim and a bold green
    star on the chest; matching pleated skirt.
  - A green ribbon bow on top of her head.
  - Both paws raised high holding big fluffy green-and-gold pompoms that spill
    past her silhouette.
  - A small green-and-gold megaphone tucked at her side.
""",
    },
    {
        "num": "05", "filename": "05_baby.png", "theme": "Baby",
        "bg": hbg(MINT,
                  "Soft floating pastel bubbles and a couple of faint sparkles drift, dreamy and gentle."),
        "expression": "wide-eyed innocent WONDER — enormous glossy sparkling eyes, "
                      "a tiny happy open smile, big rosy cheeks.",
        "prompt": """
Theme: Baby corgi puppy.
  - Extra chubby adorable baby proportions: rounder head, even bigger eyes.
  - Soft pastel sage-green baby onesie with a little white bib and a cute
    embroidered star.
  - A pastel pacifier in one paw and a small rattle in the other.
  - A pastel balloon on a string floating up beside her, string extending past
    the silhouette.
""",
    },
    {
        "num": "06", "filename": "06_books.png", "theme": "Books",
        "bg": hbg(SLATE,
                  "A couple of faint floating book pages and soft dust motes for a library mood."),
        "expression": "chill and content — relaxed half-lidded eyes, a soft clever "
                      "little smile, thoroughly enjoying her book.",
        "prompt": """
Theme: Studious scholar / bookworm.
  - Cute round wire-frame reading glasses low on her nose.
  - Cozy dark-green cable-knit sweater vest over a white collared shirt.
  - Holding an open hardcover book in her paws; a tall neat stack of colourful
    books beside her with a red ribbon bookmark.
  - A small steaming cup of tea resting on the book stack; a feather quill
    tucked behind one ear.
""",
    },
    {
        "num": "07", "filename": "07_bretonne.png", "theme": "Bretonne",
        "bg": hbg(PERIWINKLE,
                  "A few soft white specks like distant seagulls, very subtle and blurred."),
        "expression": "warm, proud and happy — a bright genuine smile, cheeks "
                      "rosy, friendly sparkling eyes.",
        "prompt": """
Theme: Traditional French Brittany (Bretonne).
  - Classic navy-and-white horizontal striped marinière sailor top.
  - A traditional tall white Breton lace coiffe headdress on her head.
  - A little red neckerchief knotted at the collar for a pop of colour.
  - A small charming wooden toy sailboat held in one paw, or resting at her
    shoulder, extending slightly past the silhouette.
""",
    },
    {
        "num": "08", "filename": "08_lyon.png", "theme": "Lyon",
        "bg": hbg("a muted royal blue (hex #4a6aa0)",
                  "Soft blurred stadium-light bokeh flares, subtle."),
        "expression": "confident, sporty and playful — a big proud grin, "
                      "energetic sparkling eyes.",
        "prompt": """
Theme: Soccer player, Olympique Lyonnais colour inspired.
  - Athletic football jersey: predominantly WHITE with clean red and dark-blue
    accents (a simple V-neck collar and side trim).
  - ABSOLUTELY NO brand logos, NO sponsor marks, NO adidas three stripes, NO
    club crests or badges — a completely plain unbranded blank jersey.
  - A classic black-and-white football (soccer ball) held under one arm.
  - A red-and-blue supporter scarf draped around her neck, its ends trailing
    past her silhouette; a small plain athletic headband.
""",
    },
    {
        "num": "09", "filename": "09_karaoke_kpop.png", "theme": "Karaoke / K-Pop",
        "bg": hbg(LILAC,
                  "Sparkly stage bokeh, a few glowing musical notes and soft light "
                  "flares float around her (decorative shapes, NOT letters)."),
        "expression": "blissful performer — eyes half-closed in passionate singing, "
                      "a big joyful open-mouth smile, cheeks flushed with emotion.",
        "prompt": """
Theme: K-Pop idol / karaoke superstar.
  - Glittery emerald-green and silver idol stage jacket with star sequin details
    and oversized cuffs.
  - Pastel mint-and-pink headphones worn around her neck.
  - Holding a shiny chrome vintage microphone up toward her mouth, mid-song, a
    little sparkle glinting off it.
  - A small green star hair clip; a couple of glowing musical notes rising near
    the mic (decorative shapes, NOT letters).
""",
    },
    {
        "num": "10", "filename": "10_cooking.png", "theme": "Cooking",
        "bg": hbg(ROSE,
                  "Fine floating flour dust and a few tiny warm sparkles catching the light."),
        "expression": "proud and beaming, truly enjoying the moment — a warm happy "
                      "smile, eyes bright and sparkling.",
        "prompt": """
Theme: French pastry chef (pâtissière).
  - Tall classic white chef toque hat, slightly oversized and charming.
  - Crisp white baker apron with a small green front pocket, light flour dusting.
  - One paw holding a golden buttery French croissant, the other a small whisk.
  - Beside her, a little trio of pastel macarons and a tiny cupcake with a
    cherry; a soft wisp of steam curling up. A tiny dusting of flour on one cheek.
""",
    },
    {
        "num": "11", "filename": "11_kimono.png", "theme": "Traditional Kimono",
        "bg": hbg(SAKURA,
                  "Soft cherry-blossom petals drifting gently, elegant and dreamy."),
        "expression": "serene, graceful and elegant — a soft demure smile, calm "
                      "radiant eyes, poised and refined.",
        "prompt": """
Theme: Traditional Japanese kimono lady.
  - An elegant traditional silk furisode KIMONO with delicate floral patterns in
    soft green, cream and gold, and a wide ornate obi sash tied at the waist.
  - A decorative kanzashi hair ornament with small dangling florals.
  - Holding a folding paper fan (sensu) gracefully near her, or a small paper
    parasol resting on one shoulder extending past the silhouette.
""",
    },
    {
        "num": "12", "filename": "12_hacker.png", "theme": "Hacker",
        "bg": hbg("A dark muted teal-charcoal (hex #1c3b39).",
                  "Faint glowing green code-glyph shapes / matrix bokeh drift in the "
                  "background (abstract glowing symbols, NOT readable letters or numbers)."),
        "expression": "focused, clever and a little mischievous — a sly confident "
                      "smirk, sharp lively eyes lit by screen glow.",
        "prompt": """
Theme: Hacker / cyber coder.
  - A dark hoodie (deep green-black) with the hood up, subtle neon-green circuit
    line accents on the fabric.
  - A sleek slim headset / earpiece with a mic.
  - Holding a small glowing laptop or tablet that casts green light on her face,
    its screen showing abstract glowing green blocks and lines (NO readable text
    or numbers).
  - Cool tech-noir vibe.
""",
    },
    {
        "num": "13", "filename": "13_aviator.png", "theme": "Aviator",
        "bg": hbg(SKY,
                  "A few soft blurred cloud wisps and gentle light bokeh, like open sky."),
        "expression": "adventurous and confident — a bright eager grin, bold "
                      "sparkling eyes, ready for takeoff.",
        "prompt": """
Theme: Aviator / vintage pilot.
  - A classic brown leather flight jacket with a fluffy cream sheepskin collar.
  - Vintage aviator goggles pushed up onto her head.
  - A flowing white silk scarf around her neck, its end trailing back past her
    silhouette as if caught in the wind.
  - A small plain stylised wings pin on the chest (blank, no text).
""",
    },
    {
        "num": "14", "filename": "14_blueprint.png", "theme": "Blueprint (Biohacking)",
        "bg": hbg("A cool muted blueprint-blue (hex #46618f).",
                  "Faint thin white blueprint grid lines with a soft glowing DNA-helix "
                  "and simple graph curves (decorative line shapes, NO readable text or numbers)."),
        "expression": "calm, precise and quietly optimistic — a serene knowing "
                      "smile, clear bright eyes with a healthy wellness glow.",
        "prompt": """
Theme: Longevity biohacker / bio-scientist ("Blueprint" wellness inspired).
  - A crisp clean white lab coat over a minimalist grey tech top; a small
    smart-watch / health tracker on the wrist.
  - Round clean glasses.
  - Holding a glowing test-tube / vial of green longevity elixir in one paw and a
    fresh green apple (or a small supplement) in the other.
  - A precise, clinical, futuristic-wellness feel.
""",
    },
    {
        "num": "15", "filename": "15_gaming.png", "theme": "Gaming",
        "bg": hbg("a dark muted indigo-teal (hex #26314c)",
                  "Faint colourful game-UI glow bokeh and soft light dots (abstract "
                  "shapes, NOT letters or numbers)."),
        "expression": "focused and playful — a competitive little grin, bright lively "
                      "eyes lit by screen glow.",
        "prompt": """
Theme: Gamer / esports.
  - A cool gaming headset with a mic worn over her ears.
  - A casual zip-up hoodie (muted teal with subtle neon accents).
  - Holding a modern game controller in both paws, mid-play, cable trailing.
  - A faint colourful screen-glow lighting her face.
""",
    },
    {
        "num": "16", "filename": "16_ramen.png", "theme": "Ramen",
        "bg": hbg("a warm muted clay-amber (hex #b58a5e)",
                  "Soft warm steam wisps and a few gentle bokeh dots."),
        "expression": "blissful and hungry — happy glossy eyes, a delighted open "
                      "smile, savouring the moment.",
        "prompt": """
Theme: Ramen lover.
  - A red hachimaki headband tied around her head (Japanese cook-style bandana)
    and a cozy casual top.
  - Holding a big steaming bowl of ramen in one paw and lifting noodles with
    chopsticks in the other.
  - Warm steam curling up around her; a couple of scallion/egg details in the bowl.
""",
    },
    {
        "num": "17", "filename": "17_fitness.png", "theme": "Fitness",
        "bg": hbg("a muted warm brick-red (hex #a85f57)",
                  "A couple of faint motion spark motes, energetic but subtle."),
        "expression": "confident, determined and energetic — a proud grin, spirited "
                      "eyes, maybe a tiny sweat drop.",
        "prompt": """
Theme: Bodybuilder / weightlifter (musculation).
  - An athletic gym tank top (muted colour) and her red polka-dot bandana around
    the neck.
  - Lifting a chunky dumbbell in one raised paw, flexing a strong little arm.
  - A white gym towel draped over one shoulder, extending past the silhouette.
""",
    },
]

# Per-card Hypurr style template (file stem in "ref hypurr converted/").
# Each card is anchored to the real Hypurr NFT whose pose/composition best fits.
REFS = {
    "01": "hypurr5",    # crown + regal robe
    "02": "hypurr40",   # samurai armour + sword
    "03": "hypurr36",   # dynamic cool 3/4  → judo gi
    "04": "hypurr12",   # cheerful, held item → pompoms
    "05": "hypurr42",   # onesie hood + teddy → baby
    "06": "hypurr8",    # glasses + book
    "07": "hypurr16",   # beret + baguette (French) → bretonne
    "08": "hypurr2",    # sporty dynamic → soccer
    "09": "hypurr26",   # music notes + held item → karaoke mic
    "10": "hypurr13",   # chef toque + spoon → pastry
    "11": "hypurr11",   # kimono
    "12": "hypurr47",   # hoodie + laptop + binary → hacker
    "13": "hypurr44",   # helmet + flight suit → aviator
    "14": "hypurr21",   # techy, holding device → blueprint lab
    "15": "hypurr45",   # VR + controller → gaming
    "16": "hypurr32",   # ramen bowl + noodle splash → ramen
    "17": "hypurr30",   # holding dumbbell → musculation
}

# Short, low-detail outfit/accessory cues for BODY-TEMPLATE mode — deliberately
# minimal so the model styles them in the Hypurr aesthetic rather than following
# an over-specified description.
SHORT = {
    "01": "a golden royal crown and a regal golden royal cape; holding a small golden sceptre",
    "02": "traditional Japanese samurai armour with a kabuto helmet; a katana",
    "03": "a white martial-arts gi with a black belt, holding a wooden training sword "
          "(bokken) in one paw",
    "04": "a cheerleader outfit with a hair bow, holding pompoms",
    "05": "a pastel PINK and light-blue horizontally striped baby onesie; a pacifier "
          "(tétine) IN HER MOUTH; hugging a soft WHITE plush bunny doudou with the other paw",
    "06": "cute round glasses drawn cleanly with proper thin temple arms (no broken or "
          "floating frame); a girly pastel-pink cardigan with a bow at the collar and a "
          "small LAVENDER hair-bow (NOT pink); holding an open book — a sweet bookworm look",
    "07": "a Breton navy-and-white striped sailor top, and a traditional tall white "
          "Breton lace bonnet (coiffe) worn ON TOP OF HER HEAD (not a crown, not a charm); "
          "holding a traditional Breton cider bowl (bolée)",
    "08": "a predominantly WHITE soccer jersey with clean red and dark-blue V-neck collar "
          "and side trim (NOT vertical stripes), holding a black-and-white soccer ball",
    "09": "a sparkly idol stage jacket and headphones, holding a microphone",
    "10": "a chef's toque and a stylish frilly pastel-pink apron with white lace trim "
          "and a big bow, a small whisk tucked in the apron pocket; holding up a cute "
          "frosted cupcake with a cherry on top — a girly pâtissière look",
    "11": "an elegant traditional Japanese kimono and a floral hair ornament, holding a folding fan",
    "12": "a dark hoodie and a headset, holding a glowing device",
    "13": "a brown leather flight jacket, aviator goggles and a white scarf",
    "14": "a white lab coat and round glasses, holding a glowing green vial in one paw "
          "and a plain unbranded digital tablet in the other paw (blank screen, NO logo, NO brand mark)",
    "15": "a gaming headset, holding a game controller",
    "16": "a red hachimaki headband, holding a steaming bowl of ramen with chopsticks",
    "17": "a NORMAL body shape (NOT bulky, NOT a bodybuilder, no exaggerated muscles), "
          "TOPLESS — bare chest, no shirt; her red polka-dot bandana around the neck; holding "
          "a dumbbell in one paw and a water bottle in the OTHER paw; a gym towel over one shoulder",
}

# BODY-TEMPLATE mode: fixed body/pose (image 2) + face identity (image 1); only
# expression, outfit, accessory and background change. Clothing kept low-detail.
BODY_PROMPT = """
TWO images.
IMAGE 1 = a photo of Taiga, a female Pembroke Welsh Corgi — use ONLY for her
identity: golden-tan & white fur, white chest, white blaze up the muzzle, erect
triangular ears with pink lining, black nose, and WARM BROWN EYES.
IMAGE 2 = the MASTER TEMPLATE for this whole NFT collection.

REPRODUCE IMAGE 2'S EXACT BODY: the same pose, the same body position and
posture, the same paw/hand positions, the same 3/4 angle, and the same chibi
proportions. The body must be IDENTICAL across every card in the collection.
Also copy image 2's crisp, clean Hypurr art style. She is Taiga the corgi with
WARM BROWN eyes (NOT green/teal). Her chest, muzzle, blaze and paw fur must stay
CRISP PURE WHITE (clean bright white with only cool grey shadows — NEVER cream,
beige, tan or off-white).

DO NOT COPY IMAGE 2'S COSTUME: image 2 wears a golden CROWN, an ornate east-asian
robe and holds a sword with a star charm — these are NOT part of the body and must
be REMOVED. Do not draw a crown, a tiara, that robe or that charm. Give her ONLY
the theme's outfit and accessory below. (A crown appears on the Golden Queen card
ONLY — never on any other card.)

FRAMING: a perfect 1:1 SQUARE image with the SAME framing and zoom as image 2 —
head plus upper body plus the curling tail, centered. Do NOT zoom into the face
and do NOT change the crop between cards.

Change ONLY these four things to the theme below, nothing else:
  (1) her EYES and facial EXPRESSION,
  (2) her CLOTHING / outfit,
  (3) her ACCESSORIES / the item held in the same hand position as image 2,
  (4) the BACKGROUND.
Keep the clothing simple, clean and nicely styled in the Hypurr aesthetic — do
NOT over-detail it.

IMPORTANT — VARY THE FACE: give her a DISTINCTIVE expression for this card. Change
the EYE shape, openness and gaze to fit the emotion — e.g. wide and sparkling,
half-lidded and cool, narrowed and fierce, or happily squeezed shut — and change
the mouth to match. Do NOT default to the same neutral eyes and gentle smile.

FACE / EYES / EXPRESSION: {expression}
OUTFIT / ACCESSORY: {short}
{bg}

No text, letters, numbers, logos, watermarks or borders.
"""

# Distinct eye + expression per card (drives the emotion variety in BODY mode).
EYES = {
    "01": "calm, regal, half-lidded confident eyes; a serene proud little smile",
    "02": "fierce, sharp, narrowed determined eyes; a stern brave set mouth",
    "03": "focused determined eyes with set brows; a confident competitive smirk",
    "04": "big wide sparkling joyful eyes; a wide open cheer smile, rosy cheeks",
    "05": "enormous round innocent wide eyes; a tiny wobbly open baby smile",
    "06": "relaxed half-lidded clever eyes behind the glasses; a soft knowing smile",
    "07": "warm friendly eyes; a big proud cheerful grin, rosy cheeks",
    "08": "bright energetic eyes; a confident open sporty grin",
    "09": "eyes happily CLOSED mid-song; mouth open singing with passion",
    "10": "eyes sparkling with delight, a little tongue licking her lips — a happy, "
          "yummy, mouth-watering expression",
    "11": "elegant, gentle, demure half-lidded eyes; a soft graceful closed smile",
    "12": "sly, sharp, narrowed clever eyes; a cool confident smirk",
    "13": "bold eager wide eyes; an excited adventurous open grin",
    "14": "calm precise focused clear eyes; a subtle knowing little smile",
    "15": "intense concentrated eyes; tongue poking out in playful focus",
    "16": "blissful eyes squeezed happy; mouth open in delighted hungry joy",
    "17": "a focused straining EFFORT expression; a gritted, effortful open grin showing "
          "clenched teeth, brows set, a small sweat drop",
}


def build_prompt_body(nft: dict) -> str:
    return BODY_PROMPT.format(
        short=SHORT.get(nft["num"], nft["theme"]),
        expression=EYES.get(nft["num"], nft.get("expression", "lively and full of character")),
        bg=nft["bg"].strip(),
    )

# ── HTTP ──────────────────────────────────────────────────────────────────────
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type":  "application/json",
    "HTTP-Referer":  "https://taigaz.art",
    "X-Title":       "Taiga NFT Generator",
}


def call_api(prompt: str, images_b64: list[str]) -> bytes | None:
    """Call OpenRouter image model with 1+ reference images. Returns PNG bytes."""
    content = [
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{im}"}}
        for im in images_b64
    ]
    content.append({"type": "text", "text": prompt.strip()})

    payload = {"model": MODEL, "messages": [{"role": "user", "content": content}]}

    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=HEADERS, json=payload, timeout=180,
    )
    if resp.status_code != 200:
        print(f"    ⚠️  HTTP {resp.status_code}: {resp.text[:300]}")
        return None

    data = resp.json()
    msg = data["choices"][0]["message"]

    # multimodal content list
    for part in (msg.get("content") if isinstance(msg.get("content"), list) else []):
        if part.get("type") == "image_url":
            url = part["image_url"]["url"]
            return (base64.b64decode(url.split(",", 1)[1]) if url.startswith("data:")
                    else requests.get(url, timeout=60).content)

    # some responses attach images separately
    for img in msg.get("images", []) or []:
        url = (img.get("image_url", {}) or {}).get("url") or img.get("url")
        if url:
            return (base64.b64decode(url.split(",", 1)[1]) if url.startswith("data:")
                    else requests.get(url, timeout=60).content)

    print(f"    ⚠️  No image part found. Snippet: {str(data)[:300]}")
    return None


def _ensure_square(path: Path) -> None:
    """Guarantee a 1:1 square crop (center-crop if the model returned non-square)."""
    try:
        from PIL import Image
        im = Image.open(path)
        w, h = im.size
        if w != h:
            s = min(w, h)
            im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).save(path)
    except Exception as e:
        print(f"    ⚠️  square-crop skipped: {e}")


def generate(prompt: str, images: list[str], out_path: Path, tries: int = 3) -> bool:
    for attempt in range(1, tries + 1):
        try:
            img = call_api(prompt, images)
            if img and len(img) > 2000:
                out_path.write_bytes(img)
                _ensure_square(out_path)
                print(f"  ✅  Saved → {out_path.name} ({len(img)//1024} KB)")
                return True
            print(f"    …no image (attempt {attempt}/{tries})")
        except Exception as e:
            print(f"    ⚠️  attempt {attempt}/{tries} error: {e}")
        time.sleep(2)
    return False


# ── LITE mode ─────────────────────────────────────────────────────────────────
# Strips our house-style rules + character anchor. Just: face photo + ONE real
# Hypurr reference, told to copy the reference's aesthetic exactly and only swap
# the outfit/scene to the theme. This is the lab4 recipe (crisper, more varied
# eyes/expression/clothing, less smooth/boofy).
MINIMAL_STYLE = """
Create a NEW NFT for the "Hypurr" collection featuring TAIGA, a female Pembroke
Welsh Corgi.

IMAGE 1 is a photo of Taiga — use it ONLY so she is recognisably this corgi:
golden-tan & white fur, white chest, white blaze up the muzzle, erect triangular
ears with pink inner lining, black nose, warm brown eyes.

IMAGE 2 is a real Hypurr NFT. COPY ITS AESTHETIC EXACTLY so Taiga looks drawn by
the same artist for the same collection:
  - the same crisp, clean linework and flat cel-shading — NOT smoother, NOT softer,
    NOT fluffier than image 2;
  - the same eye STYLE, eye SIZE and shape (do not enlarge the eyes);
  - the same kind of lively facial EXPRESSION, attitude and emotion;
  - the same chibi proportions and 3/4 posing;
  - the same crisp, detailed, well-styled way the CLOTHING and accessories are drawn.
Keep Taiga a CORGI, never a cat. Do NOT copy image 2's specific outfit, props or
background — REPLACE them with the theme below.

THEME:
{theme}
EXPRESSION: {expression}
{bg}

Give her strong personality and emotion, styled clothing, and image 2's exact
crisp art quality. No text, letters, numbers, logos, watermarks or borders.
"""


def build_prompt_lite(nft: dict) -> str:
    return MINIMAL_STYLE.format(
        theme=nft["prompt"].strip(),
        expression=nft.get("expression", "lively and full of character"),
        bg=nft["bg"].strip(),
    )


def build_prompt(nft: dict, use_anchor: bool) -> str:
    parts = [BASE_STYLE]
    if use_anchor:
        parts.append(ANCHOR_NOTE)
    parts.append(nft["prompt"])
    if nft.get("expression"):
        parts.append(f"EXPRESSION for this card: {nft['expression']}")
    parts.append(nft["bg"])
    return "\n".join(parts)


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    args      = sys.argv[1:]
    force     = "--force" in args
    make_anchor = "--anchor" in args
    no_anchor = "--no-anchor" in args
    lite      = "--lite" in args   # lab4-style: face + one Hypurr ref, no char anchor
    body      = "--body" in args   # fixed body template: face + body_template, only outfit/bg change
    nums      = [a for a in args if a.isdigit() or (len(a) == 2 and a.isdigit())]
    nums      = [a.zfill(2) for a in nums]

    print("=" * 60)
    print(f"  🐶  Taiga NFT Generator v2   model={MODEL}")
    print(f"  📁  {OUTPUT_DIR}")
    print("=" * 60)

    # ---- Anchor generation (seeded from a real Hypurr NFT for authentic style) ----
    if make_anchor:
        print(f"\n  🎯  Generating STYLE ANCHOR … (style seed: {ANCHOR_STYLE_SEED.name})")
        prompt = f"{BASE_STYLE}\n{ANCHOR_SEED_NOTE}\n{ANCHOR_PROMPT}"
        ok = generate(prompt, [REF_B64, b64(ANCHOR_STYLE_SEED)], ANCHOR_IMG)
        sys.exit(0 if ok else 1)

    use_anchor = ANCHOR_IMG.exists() and not no_anchor and not lite
    anchor_b64 = b64(ANCHOR_IMG) if use_anchor else None
    print(f"  🖇   Mode: {'LITE (face + 1 Hypurr ref, no house style)' if lite else 'standard'}   "
          f"character anchor: {'ON' if use_anchor else 'OFF'}")

    todo = [n for n in NFTS if not nums or n["num"] in nums]

    results = []
    for nft in todo:
        out = OUTPUT_DIR / nft["filename"]
        if out.exists() and not force:
            print(f"  ⏭   {nft['num']} {nft['theme']:20s} — exists, skipping")
            results.append((nft["theme"], True))
            continue

        if body:
            # IMAGE 1 = face identity, IMAGE 2 = fixed body template
            imgs = [REF_B64, b64(BODY_TEMPLATE)]
            prompt = build_prompt_body(nft)
            tag, mode = "body_template", "body"
        else:
            # IMAGE 1 = photo, [IMAGE 2 = character anchor unless lite], last = template
            imgs = [REF_B64]
            if anchor_b64:
                imgs.append(anchor_b64)
            ref_stem = REFS.get(nft["num"])
            ref_path = HYPURR_DIR / f"{ref_stem}.png" if ref_stem else None
            if ref_path and ref_path.exists():
                imgs.append(b64(ref_path))
                tag = f"template={ref_stem}"
            else:
                tag = "template=NONE"
            prompt = build_prompt_lite(nft) if lite else build_prompt(nft, use_anchor)
            mode = "lite" if lite else "std"
        print(f"\n  🎨  {nft['num']} {nft['theme']}  ({tag}, {len(imgs)} imgs, {mode}) …")
        ok = generate(prompt, imgs, out)
        results.append((nft["theme"], ok))
        time.sleep(1)

    print("\n\n📊  Summary")
    for theme, ok in results:
        print(f"  {'✅' if ok else '❌'}  {theme}")
    print(f"\n  {sum(ok for _, ok in results)}/{len(results)} ok")
