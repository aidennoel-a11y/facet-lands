# Every idea suggested so far

Check here before suggesting anything new: nothing should be suggested twice.
When an idea is built, it stays in its list (the lists are a record), and
the code is the check of what's in the game.

## The lists

| File | What's in it |
|---|---|
| [ideas-200.md](ideas-200.md) | Sea, animals, body and health, night and dread, weather, crafting, farming (200) |
| [ideas-200-b.md](ideas-200-b.md) | Adventures, gameplay systems, building, atmosphere, polish (200) |
| [ideas-200-c.md](ideas-200-c.md) | Biomes, places to find, the Lost Keep, underground, progression (200) |
| [ideas-100-d.md](ideas-100-d.md) | Animals, plants, fire, getting around, building, sky, places, friends (100) |
| [ideas-50-biomes.md](ideas-50-biomes.md) | Biomes (50) |
| [ideas-60-terrain.md](ideas-60-terrain.md) | Terrain and exploration (60) |
| [ideas-100-e-polish.md](ideas-100-e-polish.md) | Settings, game feel, sound, menus, the living world, playing together, Steam (100) |

## Suggested in conversation (not in a list)

Making it run better (Nov 2026):
- Stay with JavaScript and the browser engine; a rewrite in another language isn't worth it
- Draw fewer separate objects: merge grass, trees and water into bigger batches
- Less work for things far away
- Later options weighed: WebGPU for drawing, WebAssembly for building terrain (loading only)

Getting onto Steam (Nov 2026):
1. Wrap the game as a desktop program with Electron (same code); it can use the proper graphics card and isn't held back by the browser
2. Saves kept in files on disk, with Steam Cloud
3. Controller support (Steam Deck)
4. Steady frame rate on an ordinary laptop
5. Licence check of every sound and model for commercial use (public/sounds/CREDITS.md)
6. Steamworks account ($100 a game), store page, trailer, wishlists before launch
7. Optional: achievements, Steam friends for multiplayer, the Steam overlay (steamworks.js)
