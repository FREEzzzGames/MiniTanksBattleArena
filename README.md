# MiniTanksBattleArena (MTBA)

Standalone Canvas 2D tank battle arena for modern browsers and touch screens. The game is deployed as a static site; this repository workflow does not build an Android APK.

## Licensing and third-party assets

- Preliminary inventory and release checklist: [`ASSET_AUDIT.md`](ASSET_AUDIT.md).
- Third-party media sources, license notes, and restrictions: [`ASSET_LICENSES.md`](ASSET_LICENSES.md).
- Cinematic files and their source notes: [`assets/cinematics/README.md`](assets/cinematics/README.md).
- These notices do not grant a blanket license to the game code or original artwork. Each third-party asset remains subject to its own license and restrictions.

## Architecture

- `index.html`: semantic UI shell and orientation handling.
- `css/game.css`: one consolidated responsive stylesheet for landscape gameplay, the rotate-device gate, HUD, controls, and overlays.
- `js/game.js`: game runtime (simulation, combat, AI, canvas rendering, effects, audio and input). The runtime stays dependency-free and is loaded with `defer` after the document is parsed.
- `.github/scripts/web-smoke-test.mjs`: Chromium integration checks for tank selection, HUD, firing/reload, simultaneous touch movement and firing, smoke, tactical controls, pause/resume and viewport geometry.

## Controls

- Touch and hold the battlefield to move toward that point; no virtual joystick is used.
- Hold **FIRE** to shoot; release to stop.
- **SMOKE** deploys a smoke screen.
- **TARGET** cycles visible enemies for auto-aim.
- **COVER** moves toward cover from the nearest enemy.
- **SQUAD** cycles orders for allied tanks.
- Pause stops the battle. The menu can resume or start a new run.

## Verification and deployment

Pushes to `main` that affect the page, styles, runtime, smoke tests, workflow, or README run the Chromium smoke suite. GitHub Pages deployment runs only after the test step succeeds.

- Game: https://freezzzgames.github.io/MiniTanksBattleArena/
- Repository: https://github.com/FREEzzzGames/MiniTanksBattleArena
- Deployment checks: https://github.com/FREEzzzGames/MiniTanksBattleArena/actions
