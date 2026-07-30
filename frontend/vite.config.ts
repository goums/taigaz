import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    // Web3 deps (permissionless / viem under Privy smart wallets) expect Node
    // globals like Buffer/global/process in the browser. Polyfill them.
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
});
