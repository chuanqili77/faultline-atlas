# Faultline Atlas

Faultline Atlas is an open-book earthquake mapping game for science clubs and classroom activities. A facilitator creates a round from a reviewed USGS event. Players use the event date, magnitude and depth to investigate where it happened, then submit one map sector. The facilitator cannot select a grading key or award stamps manually. GenLayer validators agree on a normalized USGS observation, and the Intelligent Contract grades each plot and updates the player's passport.

[Play or replay the public demo](https://chuanqili77.github.io/faultline-atlas/#play) · [Stable Studionet contract](https://explorer-studio.genlayer.com/address/0x13F2b2EE57e04e9A7CCd7BD95a0F80879d281952)

## Play

- **Player.** Pick a numbered sector and lock it with a Stable Studionet wallet. A correct plot earns one stamp. An incorrect plot leaves the passport without a new stamp. Both outcomes reveal the catalog event, epicenter and correct sector.
- **Facilitator.** Enter a unique round key and a reviewed earthquake ID from the [USGS catalog](https://earthquake.usgs.gov/earthquakes/search/). Wait for finality and copy the round link. The host cannot play its own rounds. Each host's rounds contribute to that host's player passports.
- **Visitor.** The published round offers two wallet-free replays. **Charted** reads a finalized N6 plot with one stamp. **Missed** reads a finalized S2 plot with no stamp. Both use the same immutable USGS snapshot. The second player's attempt to change their answer was rejected on-chain.

## Grading

At round creation, independent validators fetch a catalog event through the [USGS FDSN service](https://earthquake.usgs.gov/fdsnws/event/1/) and use strict equality over the normalized evidence. An unavailable or unreviewed event prevents creation. The snapshot fixes the grading key for the lifetime of the round.

The map uses six 60° longitude bands in each hemisphere. Coordinates are rounded to millidegrees. Zero latitude is north, internal longitude boundaries belong to the band on their east, and +180° belongs to band 6. Passports count distinct finalized plots, and an address gets one attempt per host round. Published state is public and can be researched before playing. Stamps have no monetary value, and a wallet is not proof of a unique person.

The map uses Natural Earth public-domain geography via [world-atlas](https://github.com/topojson/world-atlas). The USGS event is used for geographic learning and the game does not score disaster impacts.

## Run and verify

Use Node.js 24.

```sh
npm ci
npm run dev
npm run build -- --base=./
npm run verify
```

[Deployment](deployment.json) and [sample transactions](demo.json) contain public verification references. The verifier checks the deployed source, finalized receipts, expected replay rejection, and both passport outcomes. `npm run deploy` creates a deployment using a fresh zero-gas Studionet account. `node scripts/check.mjs` runs a new real testnet acceptance and replaces the local demo manifest.
