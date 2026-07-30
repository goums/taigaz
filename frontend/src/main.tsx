import React from "react";
import ReactDOM from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { CHAIN, PRIVY_APP_ID } from "./config";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Frictionless start: a guest account creates an embedded wallet with
        // NO login. The guest can later "Save my collection" to link an
        // email/social and make it recoverable (see App.tsx).
        // Enable Guest accounts in the Privy Dashboard: Login methods -> Guest.
        defaultChain: CHAIN,
        supportedChains: [CHAIN],
        embeddedWallets: {
          // Create the embedded wallet automatically so guests can transact
          // immediately without any prompt.
          createOnLogin: "all-users",
        },
        // Login methods offered on the login / "Save my collection" prompt.
        // Only configured providers: email + external web3 wallet.
        loginMethods: ["email", "wallet"],
        // NOTE: Privy v2 ships English-only modal copy (no `locale` config), so
        // the login widget stays in English regardless of the app language.
        appearance: { theme: "light", walletChainType: "ethereum-only" },
      }}
    >
      {/* SmartWalletsProvider turns the embedded EOA into an ERC-4337 smart
          account. Configure the account implementation + CDP Paymaster URL in
          the Privy Dashboard (Wallets -> Smart wallets). Gas is then sponsored
          automatically for every userOp. */}
      <SmartWalletsProvider>
        <App />
      </SmartWalletsProvider>
    </PrivyProvider>
  </React.StrictMode>
);
