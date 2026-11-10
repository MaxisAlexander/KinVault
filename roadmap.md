# KinVault roadmap

## Done

- [x] Mezo Testnet only: chain 31611, faucet, explorer, wallet add/switch
- [x] Real testnet MUSD and test BTC funding with server-verified receipts
- [x] On-chain MUSD expense settlement after family approvals
- [x] Protocol-native borrowing: PriceFeed + TroveManager reads, BorrowerOperations `openTrove`/`repayMUSD`
- [x] Server-side verification: token, chain, from/to, amount, confirmations, replay protection
- [x] Hash-chained ledger entries commit to the Mezo transaction hash
- [x] Family treasury, invite codes, family registration
- [x] Emergency freeze, allowances, category whitelist
- [x] Root blockchain test suite and live read-only Mezo check

## Next

- [ ] Replace the testnet EOA treasury with a 2-of-3 Safe or a dedicated KinVault vault contract
- [ ] Contract/integration tests against a forked Mezo Testnet
- [ ] Remove remaining emojis and add final share-preview image tags
- [ ] Mainnet deployment and a third-party audit
- [ ] Merchant address book and recurring allowance automation
