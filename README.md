# make-fun-gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/arunanala65-spec/make-fun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/arunanala65-spec/make-fun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor** — a browser open-world crime game in the spirit of GTA, built for make.fun's "Make GTA 6" bounty. One neon-lit harbor district, 6×6 blocks, fully offline: three.js is vendored under `game/vendor/`, there are no network requests and no build step.

- Explore on foot or steal a car (E) and drive through live traffic and pedestrians.
- Wanted level 1–5: commit crimes and the police chase you — lose them or get busted.
- Three missions: **Borrowed Wheels** ($400) — steal any car and bring it to the garage; **Package Run** ($700) — drop packages at all three markers, in order; **Heat Wave** ($1,200) — survive a 3-star chase, then reach the safehouse.
- HUD with cash, health and wanted stars, a live minimap, start / pause / busted / wasted screens, progress saved to localStorage, and procedural WebAudio (engine, sirens, pickups) — no audio files.

Controls: **WASD** move / drive · **Shift** sprint / boost · **E** enter or exit a car · **mouse** look · **P** pause · **M** mute · **Space** handbrake.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. The game is plain static files served locally and runs fully offline (no requests leave your machine). Note: it uses ES modules, so serve it with `node serve.ts` (or any static server) rather than opening `game/index.html` directly from disk — browsers block module scripts over `file://`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ce51ph37&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
