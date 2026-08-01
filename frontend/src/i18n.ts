import type { Rarity } from "./catalog";

export type Lang = "en" | "fr";

type Dict = { rarity: Record<Rarity, string> } & { [k: string]: string | Record<Rarity, string> };

export const I18N: Record<Lang, Dict> = {
  en: {
    welcome_title: "Welcome 🌸",
    welcome_desc: "Pick a pseudo and create your guest wallet to mint your own Taigaz",
    nick_ph: "Choose your pseudo…",
    nick_title: "Pick a nickname 🌸",
    nick_desc: "Welcome back! Choose a nickname to continue.",
    continue: "🐾 Continue",
    create_wallet: "🐾 Create wallet",
    creating_wallet: "🐾 Creating…",
    already_account: "Already have an account? Log in →",
    owned_label: "Owned:",
    my_collection: "My Collection",
    discovered: "{0} / {1} discovered",
    save_collection: "💾 Save my collection",
    save_note: "🔒 Link your socials (Privy) to save your Taigaz to a permanent account.",
    view_opensea: "View on OpenSea",
    view_rarible: "View on Rarible",
    tx_success: "✨ Transaction confirmed",
    view_tx: "View on Basescan ↗",
    saved_ok: "✅ Collection saved",
    copy_addr: "Copy address",
    copied: "Copied ✓",
    view_explorer: "Basescan ↗",
    save_short: "💾 Save",
    logout: "Log out",
    await: "A mysterious corgi awaits…",
    mint_cta: "🌸 Mint a Taigaz",
    mint_another: "🌸 Mint another",
    mint_golden: "👑 Mint the Golden Queen",
    all_done: "✅ Collection complete",
    minting: "⛓️ Minting…",
    confirming: "Confirming on-chain",
    minted_ok: "✨ Minted! Welcome home, little one.",
    mint_retry: "😅 That one didn't go through — tap to try again.",
    closed: "⏳ Minting is closed",
    preparing: "⏳ Preparing your wallet…",
    cooldown: "⏳ Mint again in {0}s",
    qbanner_title: "👑 Congrats — You found the Golden Queen!! 👑",
    qbanner_body: "🗝️ You found the Golden Queen — Taiga can now return to her owners.",
    golden_found_other: "🗝️ Found by {0} — Taiga can now return to her owners.",
    mint_until: "🗓️ Mint open until {0}",
    quest_find_l1: "🌸 Collect all 17 Taigaz!",
    quest_find_a: "Good luck finding the",
    quest_find_b: "Golden Queen Taiga 🍀",
    quest_found_title: "👑 The Golden Queen has been captured!",
    quest_found_congrats: "Found by {0} 🎉 — tap her to take a look.",
    modal_meta: "Taigaz #{0}",
    rarity: { Common: "Common", Uncommon: "Uncommon", Rare: "Rare", Epic: "Epic", Legendary: "Legendary", Mythic: "Mythic" },
  },
  fr: {
    welcome_title: "Bienvenue 🌸",
    welcome_desc: "Choisis un pseudo et crée ton album pour découvrir tes Taigaz",
    nick_ph: "Choisis ton pseudo…",
    nick_title: "Choisis un pseudo 🌸",
    nick_desc: "Content de te revoir ! Choisis un pseudo pour continuer.",
    continue: "🐾 Continuer",
    create_wallet: "🐾 Créer mon album",
    creating_wallet: "🐾 Création…",
    already_account: "Déjà un compte ? Se connecter →",
    owned_label: "Collectionnées :",
    my_collection: "Ma Collection",
    discovered: "{0} / {1} Taigaz découvertes",
    save_collection: "💾 Sauvegarder ma collection",
    save_note: "🔒 Connecte tes réseaux (Privy) pour sauvegarder tes Taigaz sur un compte permanent.",
    view_opensea: "Voir sur OpenSea",
    view_rarible: "Voir sur Rarible",
    tx_success: "✨ Transaction confirmée",
    view_tx: "Voir sur Basescan ↗",
    saved_ok: "✅ Collection enregistrée",
    copy_addr: "Copier l'adresse",
    copied: "Copié ✓",
    view_explorer: "Basescan ↗",
    save_short: "💾 Sauvegarder",
    logout: "Déconnexion",
    await: "Un corgi mystérieux t'attend…",
    mint_cta: "🌸 Révéler une Taigaz",
    mint_another: "🌸 Découvrir une autre",
    mint_golden: "👑 Révéler la Golden Queen",
    all_done: "✅ Collection complète",
    minting: "⛓️ Révélation en cours…",
    confirming: "Confirmation on-chain",
    minted_ok: "✨ Révélée ! Bienvenue à la maison, petite.",
    mint_retry: "😅 Celle-ci n'a pas fonctionné — réessaie.",
    closed: "⏳ Le mint est fermé",
    preparing: "⏳ Préparation de ton wallet…",
    cooldown: "⏳ Redécouvrir dans {0}s",
    qbanner_title: "👑 Bravo — tu as trouvé la Golden Queen !! 👑",
    qbanner_body: "🗝️ Tu as trouvé la Golden Queen — Taiga peut enfin retourner chez ses propriétaires.",
    golden_found_other: "🗝️ Trouvée par {0} — Taiga peut enfin retourner chez ses propriétaires.",
    mint_until: "🗓️ Ouvert jusqu'au {0}",
    quest_find_l1: "🌸 Collectionne les 17 Taigaz !",
    quest_find_a: "Bonne chance pour retrouver la",
    quest_find_b: "Golden Queen Taiga 🍀",
    quest_found_title: "👑 La Golden Queen a été capturée !",
    quest_found_congrats: "Trouvée par {0} 🎉",
    modal_meta: "Taigaz #{0}",
    rarity: { Common: "Commune", Uncommon: "Peu commune", Rare: "Rare", Epic: "Épique", Legendary: "Légendaire", Mythic: "Mythique" },
  },
};

export function makeT(lang: Lang) {
  return (key: string, ...args: (string | number)[]): string => {
    let s = (I18N[lang] as Record<string, unknown>)[key];
    if (typeof s !== "string") s = (I18N.en as Record<string, unknown>)[key];
    if (typeof s !== "string") return key;
    let out = s;
    args.forEach((a, i) => {
      out = out.replace("{" + i + "}", String(a));
    });
    return out;
  };
}

export function tRarity(lang: Lang, r: Rarity): string {
  return I18N[lang].rarity[r] || r;
}
