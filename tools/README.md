# Testing tools

Quick ways to check the world without playing through it.

| Tool | What it does |
| --- | --- |
| `node tools/map.mjs <seed> <x> <z> <px> <m/px> out.png` | Top-down map (biomes, hill shade, rivers, creeks zoomed in) |
| `node tools/water.mjs <seed> <x> <z>` | Rivers, creeks and lakes near a spot, and how long they took |
| `node tools/shot.mjs out.png "<test address>" [wait]` | Screenshot in headless Chromium at a test address |
| `node tools/sound.mjs <kind> out.wav` | Renders a game sound offline to a WAV, with loudness and brightness |
| `python3 tools/pack-artifact.py [dir]` | Packs `dist/` as the published page (index.html, app.js, workers) |

**Test addresses.** The game reads these from the URL:
`?seed=…&x=…&z=…&y=…&yaw=…&pitch=…&hour=…&vd=…&weather=…&season=0..3&hide`
(`vd` is view distance in chunks. Keep it small for headless tests. `hide`
hides the panels.)

`shot.mjs` and `sound.mjs` need the preview server:
`npm run build && npx vite preview --port 4173 &`
