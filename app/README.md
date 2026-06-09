# Rotom — interactive web map

Static site (Leaflet + OpenStreetMap) showing how many Pokemon GO players are
active in each area of Pau. No address is ever exposed: a sector reveals its
number only once it reaches the anonymity threshold (`minVisiblePlayers`, 3).

## Files

- `index.html` / `style.css` / `app.js` — the map UI (entry point: `index.html`)
- `sectors.geojson` — zone geometry (copied from `../assets/sectors.geojson`)
- `counts.json` — live aggregated counts, written by the bot

## Preview locally

```bash
cd app
python3 -m http.server 8099
# open http://localhost:8099
```

## Deploy

Served by the VPS nginx at `rotom-pogo.mxrine-mz.dev`.
See [`../deploy/README.md`](../deploy/README.md) for the one-time setup and the
`publish.sh` update command. Only aggregated counts are published — never
member identities.

## Geometry changes

`sectors.geojson` here is a copy. When the zones change, re-copy:

```bash
cp ../assets/sectors.geojson sectors.geojson
```
