# GIWA LAUNCH frontend preview

## Included
- Trade, Market, Launch, Fundraise, Portfolio and Owner Admin screens
- GIWA Sepolia network label and chain ID 91342
- Fixed owner wallet: `0x27F5747b7791b28eadaA9a3f4EAD7076B0013DA4`
- Fundraise listing, contribution/target display, creator-only cancellation preview
- Treasury address configuration screen
- Responsive dark UI

## Important status
This is a frontend prototype, not a deployed dApp. It does not deploy tokens, accept ETH, execute swaps, store real claims, process refunds, or change treasury on-chain. Buttons that would move funds explicitly show preview-only messages. Connect-wallet uses the browser's injected EVM wallet provider; all transaction flows still require audited contracts and integration.

## Admin security design for production
1. The owner address is immutable in the deployed admin/launchpad contracts.
2. Admin entry requires the connected owner wallet and a fresh signed challenge (nonce, domain, chain ID, expiry).
3. Treasury changes are owner-only on-chain transactions; emit a `TreasuryUpdated` event.
4. Never store a plaintext password on-chain. On-chain storage is public, including hashes, and low-entropy passwords can be brute-forced offline. If a second factor is mandatory, use a high-entropy one-time secret commitment with a carefully audited verification design, or use a hardware-backed passkey/MPC signer. Do not implement a human-memorable password as an on-chain secret.
5. No recovery/backdoor means loss of the owner wallet or one-time credential can permanently lock administration. Confirm this risk before mainnet deployment.

## Fundraise invariants for contracts
- Published fundraiser terms are immutable.
- Creator may cancel only while `raised < target`.
- Contributions cannot exceed remaining target.
- At target: atomically deploy token, initialize curve, execute the initial curve buy with all raised ETH, allocate actual buy output pro rata to contributors, put remaining supply into curve inventory, and publish the token to Market.
- After target: cancellation disabled; contributor allocations are claimable once.
- Cancelled fundraiser: contributors can claim refundable ETH once.
- Prevent reentrancy, duplicate completion, replayed signatures, rounding over-allocation and unauthorized treasury changes.
