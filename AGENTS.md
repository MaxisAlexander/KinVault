# KinVault agent notes

## Architecture

- Mezo Testnet only (chain 31611). The chain layer lives in `src/lib/chain/`: config, ABIs, amount math, read-only client, protocol/trove planning, browser wallet transactions, server verification and ledger bridging.
- Vault rules (approval thresholds, loan math, lockbox release) live as pure functions in `src/lib/vault-logic.ts` with tests beside them.
- App state is an in-memory demo/live store (`src/lib/vault-store.ts`, `useSyncExternalStore`); selectors must return existing references or primitives, never new arrays/objects.
- Writes are server-authoritative: the browser only sends a transaction hash, and `verify.server.ts` checks the Mezo receipt, token, sender, recipient, amount, chain and confirmations before the ledger changes.
- MUSD and MEZO addresses, protocol contracts and the testnet faucet are defined once in `src/lib/chain/config.ts`. Do not add mainnet configuration.
- Seed data and displayed dates are deterministic (fixed demo "today", UTC formatting) so server and browser render identically.
- `blockchain.test.ts` at the repository root covers the chain layer; `TESTING.md` lists every automated and manual check.
