# Faultline Atlas — Global Seismic Field Expedition

Faultline Atlas is an open-book geography expedition for science clubs and classrooms. A facilitator assembles two to five reviewed USGS earthquakes. Learners use the dates, magnitudes and depths to locate each epicenter on a world map. Each finalized answer updates an on-chain field passport, and completing the route unlocks a public scorecard.

[Expedition desk](https://chuanqili77.github.io/faultline-atlas/#play) · [V2 contract](https://explorer-studio.genlayer.com/address/0x46cae9edB2B4D500D2B735Af3dA7dEA7c20D1ba6) · [V1 archive](https://chuanqili77.github.io/faultline-atlas/archive.html)

## Use the expedition desk

- **Facilitator.** Enter an expedition key, title and two to five distinct reviewed IDs from the [USGS Earthquake Catalog](https://earthquake.usgs.gov/earthquakes/search/). Sign the opening on Stable Studionet and share its link after finality.
- **Player.** Connect an EIP-1193 wallet, pick a map sector and lock your answer. Review the true epicenter and continue to the next checkpoint. Every correct event earns one stamp in your passport for that host.
- **Visitor.** Open the example and choose **Perfect route** or **Mixed route** to replay two completed routes without a wallet. The scorecard links to official USGS observations and recorded transactions. Copy its link or look up another player's public passport by wallet address.

## Contract rules

Each event is independently fetched and verified with GenLayer strict equality, one comparison per event, before the expedition becomes OPEN. The fixed event order and observations cannot be edited. Invalid, missing or unreviewed records prevent opening. Each player must answer in order, once per checkpoint, and hosts cannot play their own expedition. A player is COMPLETED only after submitting every required plot. The expedition remains OPEN for other players.

The map uses six 60° longitude bands per hemisphere and a fixed equirectangular projection. Coordinates are rounded to millidegrees. Zero latitude is north, internal longitude boundaries belong to the band on their east, and +180° belongs to band 6. Passport accuracy uses finalized correct and played counts, and completion history is scoped to the selected host. The map uses Natural Earth public-domain geography via [world-atlas](https://github.com/topojson/world-atlas).

This is an open-book educational activity. Answers, identities and observations are publicly readable. An address does not establish a unique human identity. Stamps have no monetary value. Transaction links appear for the documented demo and the current browser session. Arbitrary historical results remain verifiable by reading the V2 contract.

## Run and verify

Use Node.js 24 and Python 3.

```sh
npm ci
npm test
npm run build -- --base=./
npm run verify
```

[V2 deployment](deployment-v2.json) and [V2 acceptance receipts](demo-v2.json) document the real testnet run. The read-only verifier checks deployed source, finality, consensus result, execution result, sender, contract, calldata and passport state. The example players completed the same two-event route at 100% and 50%; a duplicate event, an out-of-range index and a replay were rejected. The Python tests simulate catalog response shapes and verify contract state transitions without network writes.

`npm run deploy:v2` creates a new deployment using a temporary zero-gas Studionet account. `node scripts/check-v2.mjs` runs a fresh acceptance scenario and writes a local V2 demonstration manifest. The [V1 deployment](deployment.json), [V1 receipts](demo.json) and `npm run verify:v1` are retained for historical verification.
