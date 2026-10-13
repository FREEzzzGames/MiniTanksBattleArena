# MTBA Asset and Dependency Rights Audit

Audit date: 2026-10-13  
Repository: https://github.com/FREEzzzGames/MiniTanksBattleArena

## Purpose and limits

This is a preliminary source-tree audit, not a legal opinion or a guarantee that every asset is cleared. File names, visual style, and absence of a watermark do not establish ownership or license. The repository owner should retain source pages, download dates, license terms, receipts/permissions where applicable, and original files.

## Inventory found in the repository

### Local SVG game art
The following SVG files are committed locally. Their provenance and authorship have not been independently established by this audit. Treat them as **needs provenance confirmation** until the owner confirms they were created for this project or provides the source and license.

- `assets/effects/explosion.svg`
- `assets/effects/smoke.svg`
- `assets/environment/bush.svg`
- `assets/environment/ruin.svg`
- `assets/environment/tree-autumn.svg`
- `assets/environment/tree-conifer.svg`
- `assets/tanks/tank-heavy.svg`
- `assets/tanks/tank-scout.svg`
- `assets/tanks/tank-sniper.svg`
- `assets/tanks/tank-support.svg`
- `assets/units/infantry.svg`

If these were drawn specifically for MTBA by the project owner or commissioned with rights transferred/licensed, record that evidence. If sourced from another project or website, add the original URL, creator, exact license, and required attribution. Do not apply a license retroactively to work you do not own.

### Cinematic videos
- `assets/cinematics/intro.mp4` — intended source page: https://www.pexels.com/video/a-tank-is-parked-on-the-street-in-front-of-a-building-18549840/
- `assets/cinematics/battle-start.mp4` — intended source page: https://www.pexels.com/video/a-military-tank-8124079/

Pexels license: https://www.pexels.com/license/

Pexels permits use of its media subject to its license restrictions and notes that additional rights may apply to depicted brands, logos, people, and other third-party material. See the license and terms directly: https://www.pexels.com/terms-of-service/

**Important unresolved verification:** this repository's video bytes have not been compared against the exact Pexels downloads in this audit. Earlier copies of `battle-start.mp4` included an iStock-watermarked clip. File name, file size, and this notice do not prove that the current file is the licensed Pexels download. If the exact source cannot be confirmed, remove the video from the public build until replaced with the verified Pexels file.

### JavaScript and runtime dependencies
- Browser game files: `js/game.js`, `js/cinematics.js`, `js/mtba-render-engine.js`, `js/multiplayer.js`. No third-party browser package dependencies are declared in `package.json`; confirm manually whether any vendored snippets or copied code exist.
- Server package: `ws` version range `^8.18.0` in `package.json`. Its license and notices should be verified from the installed package metadata/official project before distributing a bundled server build. Do not assume this dependency's license covers the MTBA source.
- Android/Gradle files are present. Review the Android Gradle plugin, Gradle wrapper/distribution, Android SDK components, and any bundled libraries for their own notices if distributing an APK. This repository's current package.json does not describe the Android build's full dependency graph.

### Fonts, music, sound, and external resources
This tree inventory did not identify separate local font, music, or sound asset files. That does not prove that no third-party material is embedded in code, loaded remotely, or included inside videos. Review `index.html`, CSS, JavaScript, Android build files, and each media file for remote URLs, embedded base64 assets, fonts, audio, and copied code.

## Required release checklist

- [ ] Confirm authorship/permission for every SVG listed above.
- [ ] Replace or verify both cinematic files against the exact licensed source downloads; inspect full clips for watermarks and embedded audio.
- [ ] Keep a copy of the relevant Pexels source pages and license/terms with the date accessed.
- [ ] Review any trademarks, logos, recognizable people, and other rights visible in media; do not imply endorsement.
- [ ] Audit remote URLs, copied snippets, fonts, audio, and Android/Gradle dependencies.
- [ ] Add third-party notices for dependencies and assets where their licenses require it.
- [ ] Decide whether to license MTBA's own original code. There is currently no root `LICENSE` file; public visibility does not automatically grant users an open-source license.
- [ ] Re-run tests and review GitHub Actions after audit changes.

## General rule

Do not use this file as a substitute for the actual license, permission, release, or proof of purchase. If a right cannot be confirmed, quarantine/remove that asset before release. This audit does not waive or transfer any author's or rights holder's rights.
