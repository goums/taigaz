import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useGuestAccounts, useLogin } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import {
  createPublicClient, http, encodeFunctionData, parseEventLogs, maxUint256,
} from "viem";
import {
  CHAIN, CONTRACT_ADDRESS, POOL_SIZE, RPC_URL, EXPLORER, OPENSEA, RARIBLE,
} from "./config";
import { weddingAbi } from "./abi";
import {
  TAIGAZ, RARITY_COLOR, RARITY_RANK, PLACEHOLDER, GOLDEN_MOCK_ID,
  designIdToMockId, itemById, type TaigaItem,
} from "./catalog";
import { makeT, tRarity, type Lang } from "./i18n";
import Background from "./Background";
import { initPetals, type PetalController } from "./petals";
import "./styles.css";

const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });
// Pseudo is remembered per smart-wallet address, so retrieving a different
// account doesn't inherit a previous account's nickname.
const pseudoKey = (addr: string) => `taigaz_pseudo_${addr.toLowerCase()}`;

// Token-id map persisted per wallet (mock id -> latest tokenId), populated from
// mint events. Avoids wide eth_getLogs scans (Alchemy free tier caps them to 10
// blocks); the contract isn't ERC721Enumerable so this is the pragmatic source.
type TokenMap = Record<string, number>;
const tokensKey = (wallet: string) => `taigaz_tokens_${wallet.toLowerCase()}`;
function loadTokenMap(wallet?: string): TokenMap {
  if (!wallet) return {};
  try { return JSON.parse(localStorage.getItem(tokensKey(wallet)) || "{}"); } catch { return {}; }
}
function saveTokenMap(wallet: string, map: TokenMap) {
  localStorage.setItem(tokensKey(wallet), JSON.stringify(map));
}

interface ChainState {
  loaded: boolean;
  owned: Record<string, number>;        // mock id -> count
  distinct: number;
  complete: boolean;
  claimedGolden: boolean;
  mintOpen: boolean;
  mintEnd: number;                      // unix seconds
  golden: { found: boolean; finder: string; pseudo: string };
}

const EMPTY: ChainState = {
  loaded: false, owned: {}, distinct: 0, complete: false,
  claimedGolden: false, mintOpen: false, mintEnd: 0, golden: { found: false, finder: "", pseudo: "" },
};

async function readState(me?: `0x${string}`): Promise<ChainState> {
  const base = [
    { address: CONTRACT_ADDRESS, abi: weddingAbi, functionName: "isMintOpen" },
    { address: CONTRACT_ADDRESS, abi: weddingAbi, functionName: "goldenInfo" },
    { address: CONTRACT_ADDRESS, abi: weddingAbi, functionName: "mintEnd" },
  ];
  const perUser = me
    ? [
        { address: CONTRACT_ADDRESS, abi: weddingAbi, functionName: "goldenClaimed", args: [me] },
        { address: CONTRACT_ADDRESS, abi: weddingAbi, functionName: "packedCopies", args: [me] },
      ]
    : [];

  const res = await publicClient.multicall({ contracts: [...base, ...perUser] as never, allowFailure: false });
  const mintOpen = res[0] as boolean;
  const gi = res[1] as [boolean, string, string, bigint, bigint];
  const golden = { found: gi[0], finder: gi[1], pseudo: gi[2] };
  const mintEnd = Number(res[2] as bigint);

  const owned: Record<string, number> = {};
  let complete = false, claimedGolden = false;
  if (me) {
    claimedGolden = res[3] as boolean;
    // Decode the 16 packed copy counts (16 bits each) from one word.
    const packed = res[4] as bigint;
    for (let d = 0; d < POOL_SIZE; d++) {
      const c = Number((packed >> BigInt(d * 16)) & 0xffffn);
      if (c > 0) owned[designIdToMockId(d)] = c;
    }
    complete = Object.keys(owned).length >= POOL_SIZE;
    const iAmFinder = golden.found && golden.finder.toLowerCase() === me.toLowerCase();
    if (iAmFinder || claimedGolden) owned[GOLDEN_MOCK_ID] = 1;
  }

  return { loaded: true, owned, distinct: Object.keys(owned).length, complete, claimedGolden, mintOpen, mintEnd, golden };
}

export default function App() {
  const { ready, authenticated, user, linkEmail, logout } = usePrivy();
  const { createGuestAccount } = useGuestAccounts();
  const { login } = useLogin(); // opens the Privy login modal (retrieve account)
  const { client } = useSmartWallets();

  const [lang, setLang] = useState<Lang>("fr");
  const t = useMemo(() => makeT(lang), [lang]);

  const [inApp, setInApp] = useState(false);
  const [pseudo, setPseudo] = useState("");        // resolved display name for the active wallet
  const [nickInput, setNickInput] = useState("");  // connect-screen text field
  const [nicknamePrompt, setNicknamePrompt] = useState(false); // authenticated but no name yet
  const [creating, setCreating] = useState(false);
  const pendingPseudo = useRef<string | null>(null); // name to assign to a just-created guest wallet

  const [state, setState] = useState<ChainState>(EMPTY);
  const [minting, setMinting] = useState(false);
  const [status, setStatus] = useState("");
  const [reveal, setReveal] = useState<{ item: TaigaItem; golden: boolean; tokenId: number } | null>(null);
  const [justMinted, setJustMinted] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [modalId, setModalId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ hash: string } | null>(null);
  const [tokenMap, setTokenMap] = useState<TokenMap>({});

  const petalsRef = useRef<PetalController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [walletOpen, setWalletOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const smartAddress = client?.account?.address as `0x${string}` | undefined;
  const isGuest = Boolean(user?.isGuest);
  const saved = authenticated && !isGuest;
  const shortAddr = smartAddress ? `${smartAddress.slice(0, 6)}…${smartAddress.slice(-4)}` : "0x…";
  const midAddr = smartAddress ? `${smartAddress.slice(0, 10)}…${smartAddress.slice(-8)}` : "0x…";
  // Whether the connected wallet is the one that actually found the Golden Queen.
  const iAmFinder = !!smartAddress && state.golden.found &&
    state.golden.finder.toLowerCase() === smartAddress.toLowerCase();

  // Human label for the linked account, shown next to "Collection enregistrée".
  const linkedLabel = useMemo(() => {
    const u = user as any;
    if (!u) return "";
    if (u.google?.email) return u.google.email;
    if (u.email?.address) return u.email.address;
    if (u.phone?.number) return u.phone.number;
    // External web3 wallet the user connected (NOT the Privy embedded signer).
    const ext = (u.linkedAccounts || []).find(
      (a: any) => a.type === "wallet" && a.walletClientType && a.walletClientType !== "privy"
    );
    const addr = ext?.address || u.wallet?.address;
    if (addr) return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    return "";
  }, [user]);

  const copyAddr = useCallback(() => {
    if (!smartAddress) return;
    navigator.clipboard?.writeText(smartAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [smartAddress]);

  // Petal confetti engine.
  useEffect(() => {
    if (canvasRef.current && !petalsRef.current) petalsRef.current = initPetals(canvasRef.current);
    return () => { petalsRef.current?.destroy(); petalsRef.current = null; };
  }, []);

  // Resolve the nickname for the authenticated wallet and decide whether to enter
  // the app or prompt for a nickname. Runs once the smart wallet address is known.
  //   1. a just-created guest carries its typed name via pendingPseudo
  //   2. else a name remembered locally for THIS wallet
  //   3. else the on-chain pseudo (a returning account that set one)
  //   4. else prompt for a nickname before entering (retrieved empty account)
  useEffect(() => {
    if (!ready || !authenticated || inApp || !smartAddress) return;
    let cancelled = false;

    if (pendingPseudo.current) {
      const n = pendingPseudo.current;
      pendingPseudo.current = null;
      localStorage.setItem(pseudoKey(smartAddress), n);
      setPseudo(n);
      setNicknamePrompt(false);
      setInApp(true);
      return;
    }
    const local = localStorage.getItem(pseudoKey(smartAddress));
    if (local) {
      setPseudo(local);
      setNicknamePrompt(false);
      setInApp(true);
      return;
    }
    publicClient
      .readContract({ address: CONTRACT_ADDRESS, abi: weddingAbi, functionName: "pseudoOf", args: [smartAddress] })
      .then((p) => {
        if (cancelled) return;
        const s = ((p as string) || "").trim();
        if (s) {
          localStorage.setItem(pseudoKey(smartAddress), s);
          setPseudo(s);
          setNicknamePrompt(false);
          setInApp(true);
        } else {
          setNicknamePrompt(true); // retrieved account with no nickname — ask for one
        }
      })
      .catch(() => setNicknamePrompt(true));

    return () => { cancelled = true; };
  }, [ready, authenticated, inApp, smartAddress]);

  // Commit a nickname for the active (authenticated) wallet and enter the app.
  const confirmNickname = useCallback(() => {
    const n = nickInput.trim();
    if (!n || !smartAddress) return;
    localStorage.setItem(pseudoKey(smartAddress), n);
    setPseudo(n);
    setNicknamePrompt(false);
    setInApp(true);
  }, [nickInput, smartAddress]);

  // One read on mount (no wallet needed) so the mint window + golden status show
  // on the connect screen before the user enters the app.
  useEffect(() => {
    readState(undefined).then(setState).catch(() => {});
  }, []);

  // Load the persisted token-id map when the wallet resolves.
  useEffect(() => {
    if (smartAddress) setTokenMap(loadTokenMap(smartAddress));
  }, [smartAddress]);

  const refresh = useCallback(async () => {
    try {
      const s = await readState(smartAddress);
      setState(s);
    } catch (e: any) {
      console.error("[taigaz] read FAILED:", e?.shortMessage || e?.message, e);
      setStatus("Network error reading the collection — retrying…");
    }
  }, [smartAddress]);

  // Initial + periodic refresh (polls the golden finder + collection live).
  useEffect(() => {
    if (!inApp) return;
    refresh();
    const id = setInterval(refresh, 12000);
    return () => clearInterval(id);
  }, [inApp, smartAddress, refresh]);

  // Cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // When the cooldown ends, fade out any confetti still on screen.
  useEffect(() => {
    if (cooldown === 0) petalsRef.current?.fadeOut();
  }, [cooldown]);

  // Auto-dismiss the success toast.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const createWallet = useCallback(async () => {
    const name = nickInput.trim();
    if (!name) return; // nickname required
    // The wallet doesn't exist yet; the resolution effect assigns this name once
    // the new guest smart wallet address resolves.
    pendingPseudo.current = name;
    setCreating(true);
    try {
      if (!authenticated) await createGuestAccount();
      petalsRef.current?.burst(30);
    } catch (e: any) {
      pendingPseudo.current = null;
      setStatus(e?.message ?? "Could not create wallet");
    } finally {
      setCreating(false);
    }
  }, [authenticated, createGuestAccount, nickInput]);

  const mint = useCallback(async () => {
    if (!client || minting || !smartAddress) return;
    setMinting(true);
    setReveal(null);
    setStatus(t("confirming"));
    try {
      // Snapshot ownership BEFORE minting so we can detect the new design by diff.
      const prev = await readState(smartAddress).catch(() => null);

      const name = pseudo.trim();
      const data = name
        ? encodeFunctionData({ abi: weddingAbi, functionName: "mintAs", args: [name] })
        : encodeFunctionData({ abi: weddingAbi, functionName: "mint" });
      // Explicit callGasLimit so the mint isn't starved by the bundler's
      // occasionally-low estimate (the first mint of a wallet is ~220k all-cold;
      // this caused intermittent OutOfGas userOps). Unused gas is refunded.
      const hash = await client.sendTransaction({
        account: client.account,
        calls: [{ to: CONTRACT_ADDRESS, data }],
        callGasLimit: 600000n,
      } as any);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const toMock = (d: bigint) => (d === maxUint256 ? GOLDEN_MOCK_ID : designIdToMockId(Number(d)));

      // PRIMARY source: the Minted event in THIS tx's receipt (deterministic, no
      // read lag). Filter to my address (the tx may be a bundle of userOps).
      let myLogs: any[] = [];
      try {
        const parsed = parseEventLogs({ abi: weddingAbi, logs: receipt.logs, eventName: "Minted" });
        myLogs = parsed.filter(
          (l: any) => l.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() &&
            l.args.to?.toLowerCase() === smartAddress.toLowerCase()
        );
      } catch (e) {
        console.error("[taigaz] Minted log parse failed:", e);
      }

      let mockId: string | null = null;
      let tokenId = 0;
      if (myLogs.length) {
        const last = myLogs[myLogs.length - 1];
        mockId = toMock(last.args.designId as bigint);
        tokenId = Number(last.args.tokenId);
      }

      // FALLBACK: on-chain count diff, retried to absorb read-after-write lag
      // (the node may not reflect the mint the instant the receipt lands).
      let next = await readState(smartAddress);
      for (let attempt = 0; attempt < 6 && !mockId; attempt++) {
        if (next.owned[GOLDEN_MOCK_ID] && !prev?.owned[GOLDEN_MOCK_ID]) { mockId = GOLDEN_MOCK_ID; break; }
        for (const k of Object.keys(next.owned)) {
          if ((next.owned[k] || 0) > (prev?.owned?.[k] || 0)) { mockId = k; break; }
        }
        if (mockId) break;
        await new Promise((r) => setTimeout(r, 1000));
        next = await readState(smartAddress);
      }

      console.info(
        "[taigaz] reveal decision: mockId=%s tokenId=%s myLogs=%s prevDistinct=%s nextDistinct=%s tx=%s",
        mockId, tokenId, myLogs.length, prev?.distinct ?? -1, next.distinct, hash
      );

      if (mockId) {
        const item = itemById(mockId)!;
        const isGolden = mockId === GOLDEN_MOCK_ID;
        // Preload the reveal art so switching from the placeholder is instant.
        // Otherwise the reused <img> keeps showing the old placeholder (now at
        // full opacity, since the is-placeholder class is gone) for a blink
        // while the new src loads.
        await new Promise<void>((res) => {
          const im = new Image();
          im.onload = () => res();
          im.onerror = () => res();
          im.src = item.img;
          setTimeout(res, 1500); // don't hang the reveal if the image stalls
        });
        setReveal({ item, golden: isGolden, tokenId });
        setJustMinted(mockId);
        if (tokenId) {
          setTokenMap((pm) => { const nx = { ...pm, [mockId!]: tokenId }; saveTokenMap(smartAddress, nx); return nx; });
        }
        isGolden ? petalsRef.current?.celebrateGolden() : petalsRef.current?.celebrate();
        setStatus("");

        // Optimistically reflect the new card if the post-mint read lagged.
        const expected = (prev?.owned?.[mockId] || 0) + 1;
        if ((next.owned[mockId] || 0) < expected) {
          const owned = { ...next.owned, [mockId]: expected };
          next = { ...next, owned, distinct: Object.keys(owned).length };
        }

        setToast({ hash });
        setCooldown(10);
      } else {
        // No new token detected after retries — the userOp's inner call almost
        // certainly reverted (the bundler tx still "succeeds"). Don't claim a
        // mint; let the guest retry immediately (no cooldown, no toast).
        console.error("[taigaz] mint did NOT land (likely reverted userOp):", hash, "receipt logs:", receipt.logs.length);
        setStatus(t("mint_retry"));
      }

      setState(next);
    } catch (e: any) {
      console.error("[taigaz] mint FAILED:", e?.shortMessage || e?.message, "| details:", e?.details, "| cause:", e?.cause, e);
      setStatus(e?.shortMessage ?? e?.message ?? "Mint failed");
    } finally {
      setMinting(false);
    }
  }, [client, minting, pseudo, t, smartAddress]);

  const save = useCallback(() => {
    try { linkEmail(); } catch { /* opens Privy modal */ }
  }, [linkEmail]);

  // Disconnect and return to the home (connect) screen.
  const handleLogout = useCallback(async () => {
    setWalletOpen(false);
    try { await logout(); } catch { /* ignore */ }
    setInApp(false);
    setNicknamePrompt(false);
    setNickInput("");
    setPseudo("");
    setReveal(null);
    setStatus("");
  }, [logout]);

  const sorted = useMemo(() => {
    return [...TAIGAZ].sort((a, b) => {
      const oa = state.owned[a.id] ? 0 : 1, ob = state.owned[b.id] ? 0 : 1;
      if (oa !== ob) return oa - ob;
      if (RARITY_RANK[a.rarity] !== RARITY_RANK[b.rarity]) return RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity];
      return a.id.localeCompare(b.id);
    });
  }, [state.owned]);

  const modalItem = modalId ? itemById(modalId) : null;
  const modalTokenId = modalId ? tokenMap[modalId] : undefined;

  // Deadline shown in Paris time, e.g. "16 août 2026 à 23:59".
  const deadlineText = useMemo(() => {
    if (!state.mintEnd) return "";
    const d = new Date(state.mintEnd * 1000);
    const fmt = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
      timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short",
    });
    return fmt.format(d);
  }, [state.mintEnd, lang]);

  const mintLabel = !state.loaded
    ? "⏳ …"
    : !state.mintOpen
      ? t("closed")
      : !client
        ? t("preparing")
        : minting
          ? t("minting")
          : cooldown > 0
            ? t("cooldown", cooldown)
            : state.complete && state.claimedGolden
              ? t("all_done")
              : state.complete
                ? t("mint_golden")
                : state.distinct > 0
                  ? t("mint_another")
                  : t("mint_cta");
  const mintDisabled = !state.loaded || !state.mintOpen || !client || minting ||
    cooldown > 0 || (state.complete && state.claimedGolden);

  return (
    <>
      <canvas id="petals" ref={canvasRef} />
      <Background />

      <header className="brand">
        <div className="hero-banner">
          <div className="hero-title">
            <span className="logo-corgi" role="img" aria-label="Taigaz corgi"><span className="logo-corgi-fill" /></span>
            <h1>TAIGAZ</h1>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div
          className={"quest-box" + (state.golden.found ? " found" : "")}
          onClick={() => state.golden.found && setModalId(GOLDEN_MOCK_ID)}
        >
          {state.golden.found ? (
            <>
              <img className="quest-queen" src={itemById(GOLDEN_MOCK_ID)!.img} alt="Golden Queen" />
              <div className="quest-text">
                <div className="quest-line1">{t("quest_found_title")}</div>
                <div className="quest-line2" dangerouslySetInnerHTML={{ __html: t("quest_found_congrats", `<b>${state.golden.pseudo || "?"}</b>`) }} />
              </div>
            </>
          ) : (
            <>
              <div className="quest-find-l1">{t("quest_find_l1")}</div>
              <div className="quest-find-l2">
                <span style={{ color: "var(--c-green)" }}>{t("quest_find_a")}</span>{" "}
                <span style={{ color: "var(--c-gold-deep)", whiteSpace: "nowrap" }}>{t("quest_find_b")}</span>
              </div>
            </>
          )}
        </div>

        {!inApp ? (
          nicknamePrompt ? (
            // Authenticated (e.g. retrieved account) but no nickname yet — require one.
            <section id="connect" className="card">
              <div className="connect-avatar"><img src={PLACEHOLDER} alt="A mysterious Taiga spirit" /></div>
              <h2>{t("nick_title")}</h2>
              <p>{t("nick_desc")}</p>
              <input
                className="nick-input" type="text" maxLength={18} autoComplete="off" autoFocus
                placeholder={t("nick_ph")} value={nickInput}
                onChange={(e) => setNickInput(e.target.value.slice(0, 18))}
                onKeyDown={(e) => { if (e.key === "Enter" && nickInput.trim()) confirmNickname(); }}
              />
              <button className="btn" onClick={confirmNickname} disabled={!nickInput.trim()}>
                {t("continue")}
              </button>
              <button className="link-btn" onClick={handleLogout}>{t("logout")}</button>
            </section>
          ) : (
            <section id="connect" className="card">
              <div className="connect-avatar"><img src={PLACEHOLDER} alt="A mysterious Taiga spirit" /></div>
              <h2>{t("welcome_title")}</h2>
              <p>{t("welcome_desc")}</p>
              <input
                className="nick-input" type="text" maxLength={18} autoComplete="off"
                placeholder={t("nick_ph")} value={nickInput}
                onChange={(e) => setNickInput(e.target.value.slice(0, 18))}
                onKeyDown={(e) => { if (e.key === "Enter" && nickInput.trim()) createWallet(); }}
              />
              <button className="btn" onClick={createWallet} disabled={creating || !ready || !nickInput.trim()}>
                {creating ? t("creating_wallet") : t("create_wallet")}
              </button>
              <button className="link-btn" onClick={() => login()} disabled={!ready}>
                {t("already_account")}
              </button>
            </section>
          )
        ) : (
          <section id="app">
            <div className="card">
              <div className="topbar">
                <div className="wallet-wrap">
                  <button className="wallet-pill wallet-btn" onClick={() => setWalletOpen((v) => !v)} title={smartAddress}>
                    <span className="dot" /><b>{pseudo || "Guest"}</b><span className="wallet-addr">{shortAddr}</span>
                  </button>
                  {walletOpen && (
                    <div className="wallet-pop">
                      <div className="wallet-pop-head">
                        <span className="wallet-pop-addr" title={smartAddress}>{midAddr}</span>
                        <button className="icon-btn" onClick={copyAddr} title={copied ? t("copied") : t("copy_addr")} aria-label={t("copy_addr")}>
                          {copied ? (
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                          )}
                        </button>
                      </div>

                      {isGuest ? (
                        <button className="wallet-pop-save" onClick={() => { setWalletOpen(false); save(); }}>
                          {t("save_collection")}
                        </button>
                      ) : linkedLabel ? (
                        <div className="wallet-pop-saved">
                          <span>{t("saved_ok")}</span>
                          <span className="wallet-pop-acct">{linkedLabel}</span>
                        </div>
                      ) : null}

                      <div className="wallet-pop-foot">
                        <a href={`${EXPLORER}/address/${smartAddress}`} target="_blank" rel="noopener noreferrer">{t("view_explorer")}</a>
                        <button className="wallet-pop-logout" onClick={handleLogout}>{t("logout")}</button>
                      </div>
                    </div>
                  )}
                </div>
                <span className="wallet-pill owned-pill" style={{ borderColor: "var(--emerald)", color: "var(--emerald-deep)" }}>
                  🌿 <span>{t("owned_label")}</span> <b>{state.distinct}</b> / <b>{TAIGAZ.length}</b>
                </span>
              </div>

              <div className="mint-grid">
                <div className={"reveal-card" + (reveal?.golden ? " golden" : "") + (reveal ? " revealed" : "")}>
                  <div className="taiga-frame">
                    {reveal ? (
                      <div key="art-reveal" className="art reveal-pop" style={{ background: `radial-gradient(circle,${RARITY_COLOR[reveal.item.rarity]}33,#fff)` }}>
                        <img className="art-img" src={reveal.item.img} alt={reveal.item.name} draggable={false} />
                      </div>
                    ) : (
                      <div key="art-ph" className={"art is-placeholder" + (minting ? " summoning" : "")}>
                        <img className="art-img" src={PLACEHOLDER} alt="Hidden Taiga" />
                        {minting && <div className="spinner" />}
                      </div>
                    )}
                  </div>
                  <div className="reveal-info">
                    {reveal ? (
                      <>
                        <div className="taiga-rarity" style={{ color: RARITY_COLOR[reveal.item.rarity] }}>{tRarity(lang, reveal.item.rarity)}</div>
                        <div className="taiga-name">{reveal.item.name}</div>
                        <div className="taiga-meta">{t("modal_meta", reveal.tokenId)}</div>
                      </>
                    ) : (
                      <div className="status">{status || t("await")}</div>
                    )}
                  </div>
                </div>

                {reveal?.golden && (
                  <div className="quest-banner">
                    <div className="quest-title">{t("qbanner_title")}</div>
                    <div className="quest-body">{t("qbanner_body")}</div>
                  </div>
                )}

                {status && reveal && <div className="status">{status}</div>}

                <div>
                  <button className="btn" onClick={mint} disabled={mintDisabled}>{mintLabel}</button>
                  {state.mintOpen && deadlineText && (
                    <div className="mint-deadline">{t("mint_until", deadlineText)}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="card collection-card">
              <h2 className="section-title">{t("my_collection")}</h2>
              <p className="section-sub"><span className="count-badge">{t("discovered", state.distinct, TAIGAZ.length)}</span></p>
              <div className="collection">
                {sorted.map((item) => {
                  const count = state.owned[item.id] || 0;
                  const owned = count > 0;
                  const golden = item.id === GOLDEN_MOCK_ID;
                  const cls = owned
                    ? "slot owned" + (golden ? " golden-slot" : "") + (item.id === justMinted ? " just-minted" : "")
                    : "slot locked";
                  return (
                    <div key={item.id} className={cls} onClick={() => owned && setModalId(item.id)}>
                      <img className="art-img" src={owned ? item.img : PLACEHOLDER} alt={owned ? item.name : ""} draggable={false} />
                      {owned && count > 1 && <span className="badge">×{count}</span>}
                      {!owned && <span className="lock">🔒</span>}
                      <span className="cap"><b>{owned ? item.name : "???"}</b><i style={{ color: RARITY_COLOR[item.rarity] }}>{tRarity(lang, item.rarity)}</i></span>
                    </div>
                  );
                })}
              </div>

              <div className="save-row">
                {saved ? (
                  <p className="save-ok">
                    {t("saved_ok")}{linkedLabel && <span className="save-ok-acct"> · {linkedLabel}</span>}
                  </p>
                ) : (
                  <button className="btn save-btn" onClick={save}>{t("save_collection")}</button>
                )}
                <div className="market-row">
                  <a className="btn btn-secondary" href={OPENSEA} target="_blank" rel="noopener noreferrer">
                    <svg className="mk-ico" viewBox="0 0 90 90" aria-hidden="true">
                      <circle cx="45" cy="45" r="45" fill="#2081E2" />
                      <path fill="#fff" d="M22.2 46.5l.2-.3 11.9-18.6c.2-.3.6-.2.7.1 2 4.5 3.7 10 2.9 13.5-.4 1.4-1.3 3.4-2.3 5.2a.6.6 0 0 1-.5.3H22.7c-.5 0-.8-.5-.5-.9z" />
                      <path fill="#fff" d="M74.4 51.3v2.9c0 .2-.1.3-.3.4-1 .4-4.2 1.9-5.6 3.7-3.4 4.7-6 11.4-11.8 11.4H33.5c-8.6 0-15.5-7-15.5-15.5v-.3c0-.2.2-.4.4-.4h13.3c.3 0 .5.2.5.5-.1 1 .1 2 .5 2.9.8 1.7 2.6 2.8 4.5 2.8h6.6v-5.1h-6.5c-.3 0-.5-.4-.4-.7.1-.2.2-.4.4-.7 1-1.4 2.4-3.6 3.8-6.1a30.5 30.5 0 0 0 3.7-16.6c-.1-2-.4-4-.9-5.9-.3-1.3.7-2.6 2-2.6h.3c.7 0 1.4.4 1.8 1a35 35 0 0 1 4.7 21.4c-.3 2.8-1 5.6-2.1 8.2h.3c1 0 3.6-.1 4.6-.3.3 0 .6-.2.9-.5.9-1.1 1.6-2.4 2.5-3.6.1-.2.3-.3.6-.3h11.4c.3 0 .6.3.6.6z" />
                    </svg>
                    <span>{t("view_opensea")}</span>
                  </a>
                  <a className="btn btn-secondary" href={RARIBLE} target="_blank" rel="noopener noreferrer">
                    <svg className="mk-ico" viewBox="0 0 32 32" aria-hidden="true">
                      <rect width="32" height="32" rx="8" fill="#FEDA03" />
                      <path fill="#000" d="M10.5 8.5h7.2c2.8 0 4.4 1.6 4.4 3.9 0 1.6-.9 2.8-2.3 3.4l2.6 5H18.9l-2.2-4.4h-2.6v4.4h-3.6V8.5zm3.6 3.2v2.6h3.3c1 0 1.6-.5 1.6-1.3s-.6-1.3-1.6-1.3h-3.3z" />
                    </svg>
                    <span>{t("view_rarible")}</span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}

        <footer>
          🐾 Taigaz - Eleonore &amp; Cheun - 15/08/2026 🌸
          <div className="lang-toggle">
            <button className={"lang-btn" + (lang === "en" ? " active" : "")} onClick={() => setLang("en")} aria-label="English">🇬🇧</button>
            <button className={"lang-btn" + (lang === "fr" ? " active" : "")} onClick={() => setLang("fr")} aria-label="Français">🇫🇷</button>
          </div>
        </footer>
      </div>

      {/* Success toast */}
      {toast && (
        <div className="toast">
          <span>{t("tx_success")}</span>
          <a href={`${EXPLORER}/tx/${toast.hash}`} target="_blank" rel="noopener noreferrer">{t("view_tx")}</a>
        </div>
      )}

      {/* Detail modal */}
      {modalItem && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalId(null); }}>
          <div className={"modal-card" + (modalItem.id === GOLDEN_MOCK_ID ? " golden" : "")}>
            <button className="modal-close" onClick={() => setModalId(null)} aria-label="Close">✕</button>
            <div className="modal-art"><img className="art-img" src={modalItem.img} alt={modalItem.name} /></div>
            <div className="modal-info">
              <div className="modal-rarity" style={{ color: RARITY_COLOR[modalItem.rarity] }}>{tRarity(lang, modalItem.rarity)}</div>
              <h3 className="modal-name">{modalItem.name}</h3>
              <div className="modal-meta">{modalTokenId != null ? t("modal_meta", modalTokenId) : modalItem.name}</div>
              {modalItem.id === GOLDEN_MOCK_ID && (
                <div className="modal-quest">
                  {iAmFinder ? t("qbanner_body") : t("golden_found_other", state.golden.pseudo || "?")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
