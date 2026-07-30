# Taigaz

A private-event NFT collection starring **Taiga the corgi** — 17 Hypurr-style
designs (16 pool + 1 legendary golden), minted gaslessly by guests.

## Structure

| Folder | What's inside |
|--------|---------------|
| **`nft/`** | Art generation — Python scripts (`generate_nfts.py`, `make_banner_placeholder.py`), the style guide, source references, and the final 17 images (`nft_output/final_set/`). |
| **`contracts/`** | Foundry smart contract (`WeddingCollection.sol`), deploy/configure scripts, and `generate_metadata.py` (writes token metadata into the frontend). |
| **`frontend/`** | Vite + React mint app. Its `public/` also hosts the NFT images and metadata served by Vercel. |

## Deploy

- **Frontend → Vercel:** set the project's root directory to `frontend`.
- **Metadata/images** are served from `frontend/public` (e.g. `https://taigaz.vercel.app/metadata/0.json`), and the contract's on-chain URIs point there via `contracts/script/Configure.s.sol`.

Each subfolder has its own README / guide with details.
