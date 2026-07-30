// Display catalog (names, art, rarity) ported from the design mockup.
// Mapping to on-chain ids:
//   - mock id '01' = Golden Queen  -> contract GOLDEN_DESIGN sentinel
//   - mock id 'NN' (02..17)        -> contract designId = NN - 2  (0..15)

export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic";

export interface TaigaItem {
  id: string; // mock id, '01'..'17'
  name: string;
  img: string;
  rarity: Rarity;
}

const IMG = "/nft/";
export const PLACEHOLDER = "/collection_assets/placeholder_raw.png";

export const TAIGAZ: TaigaItem[] = [
  { id: "01", name: "Golden Queen", img: IMG + "01_golden_queen.png", rarity: "Legendary" },
  { id: "02", name: "Samurai", img: IMG + "02_samurai.png", rarity: "Epic" },
  { id: "03", name: "Martial Art", img: IMG + "03_martial_art.png", rarity: "Common" },
  { id: "04", name: "Cheerleader", img: IMG + "04_cheerleader.png", rarity: "Rare" },
  { id: "05", name: "Baby", img: IMG + "05_baby.png", rarity: "Rare" },
  { id: "06", name: "Books", img: IMG + "06_books.png", rarity: "Common" },
  { id: "07", name: "Bretonne", img: IMG + "07_bretonne.png", rarity: "Common" },
  { id: "08", name: "Lyon", img: IMG + "08_lyon.png", rarity: "Common" },
  { id: "09", name: "Karaoke K-pop", img: IMG + "09_karaoke_kpop.png", rarity: "Rare" },
  { id: "10", name: "Cooking", img: IMG + "10_cooking.png", rarity: "Common" },
  { id: "11", name: "Kimono", img: IMG + "11_kimono.png", rarity: "Epic" },
  { id: "12", name: "Hacker", img: IMG + "12_hacker.png", rarity: "Rare" },
  { id: "13", name: "Aviator", img: IMG + "13_aviator.png", rarity: "Rare" },
  { id: "14", name: "Blueprint", img: IMG + "14_blueprint.png", rarity: "Rare" },
  { id: "15", name: "Gaming", img: IMG + "15_gaming.png", rarity: "Common" },
  { id: "16", name: "Ramen", img: IMG + "16_ramen.png", rarity: "Common" },
  { id: "17", name: "Fitness", img: IMG + "17_fitness.png", rarity: "Common" },
];

export const GOLDEN_MOCK_ID = "01";

export const RARITY_COLOR: Record<Rarity, string> = {
  Common: "#7f938e",
  Uncommon: "#2c5954",
  Rare: "#a978cf",
  Epic: "#7a5cc6",
  Legendary: "#c79a3f",
  Mythic: "#d15b74",
};

export const RARITY_RANK: Record<Rarity, number> = {
  Mythic: 0,
  Legendary: 1,
  Epic: 2,
  Rare: 3,
  Uncommon: 4,
  Common: 5,
};

/** Contract pool designId (0..15) -> mock catalog id ('02'..'17'). */
export function designIdToMockId(designId: number): string {
  return String(designId + 2).padStart(2, "0");
}

/** Look up a catalog item by mock id. */
export function itemById(id: string): TaigaItem | undefined {
  return TAIGAZ.find((t) => t.id === id);
}
