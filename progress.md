Original prompt: Build a real zoomable, pannable, responsive interface for the QoL mod, with a minimal separately committed core seam, persisted install-wide settings, keyboard/mouse/touch support, map support, graphics sharpening, rendered verification, documentation, and required test gates.

## Checkpoint

- Read the QoL README, changelog, manifest, source/tests, and package scripts.
- The QoL repository has no PLANNED.md or ENGINE_SEAMS.md file.
- Read core CLAUDE.md, docs/PLANNED.md, and docs/modding/MOD_SEAMS.md.
- No declined or not-applicable entry conflicts with the feature. Core PLANNED issue #12 identifies UI moddability as open work.
- Preserve the unrelated untracked pnpm-lock.yaml and pnpm-workspace.yaml in the QoL checkout.
- Core seam design in progress: runtime GlyphTerm reflow configuration, a mod display controller that exposes current viewport/camera and narrow setters, dynamic WorldFrame sizing through the reflowed term, and an active map-window repaint path.
- Core seam implemented and committed in neo-angband as f1d6f1a5.
- Core gate after the seam: pnpm build passed; packages/web/src passed 181 files and 3372 tests, with 1 file and 9 tests skipped.
- Core input subscription committed as 3709439d.
- Phone graphics testing found an active map overlay that retained its desktop rectangle across resize. Fixed and committed in core as a211a131; targeted gate passed 121 tests.
- Mod implementation is complete in source and generated plugin.js. The source build currently passes 3 files and 52 tests.
- Rendered through the local Electron desktop shell over CDP at desktop size and a measured 355x710 CSS phone viewport in ASCII and Shockbolt Light graphics, in both play and M map views.
- Verified Ctrl keyboard zoom/pan, pointer-targeted Ctrl-Wheel, view pinch/two-finger pan, sidebar pinch/two-finger scrolling, responsive resize, reload persistence, and map zoom/pan.
- On the same phone graphics frame, the optional crisp sampler increased mean adjacent-pixel edge contrast from 4.75 to 8.29 and reduced interpolated unique colors from 8208 to 5774.
- Final QoL gate: npm run verify passed 3 files and 52 tests; generated plugin.js current at 33.7 KiB.
- Final core gate: pnpm build passed; packages/web/src passed 181 files and 3372 tests, with 1 file and 9 tests skipped.
- Core working tree cleaned after deleting the generated visual-test profile and screenshots.

## Completed

- QoL feature committed as 138d617.

## Refinement checkpoint

- New prompt: remove all responsive-layout scrolling and chrome, fit the phone sidebar, keep every grid edge on whole cells, refit on resize, exempt or responsively fit the title, and audit the footer and text-heavy screens with real screenshots.
- Confirmed the installed mod applies the saved interface zoom before the title menu. At 355x710, the title canvas measured 1186.99x740 and the document body measured 1187x740, so the title was clipped horizontally and vertically.
- The core title, footer, and text-heavy screens all render inside the terminal canvas. The core terminal already uses whole-cell dimensions, and its fixed title mode aspect-fits and centers the full 80x24 composition when the mod does not enable gameplay reflow early.
- Chosen title strategy: use core's continuation markers to defer the mod's gameplay grid until the live game boot, while ignoring the HUD frames core paints behind title and birth. This exempts those pre-game screens from saved play/interface zoom while retaining the core fitted composition.
- Chosen sidebar strategy: replace overflow scrolling with fitted, explicitly paged status groups. A button and two-finger swipe will reach every page without a scrollbar.
- Playwright is not present in this checkout and package installation is forbidden by the task. Continue the prior real-pixel verification path by driving the current built Electron desktop shell over CDP, with every test profile and screenshot kept under this working directory.
- Final 355x710 play measurement at maximum saved zoom: a 350 px whole-cell grid centered at x=2 with an 8 px vertical margin; sidebar host, client, and scroll widths all 350 px, height values all 42 px, overflow hidden, and a reachable 1/4 page button. The document and body were exactly 355x710 with no scroll range.
- A 390x845 resize re-snapped without input to a 378 px grid/sidebar centered at x=6 and y=2; document, body, client, and scroll dimensions all matched the viewport.
- At 1280x720 the document and body stayed exactly 1280x720; the top HUD measured 1280x96 with matching client/scroll sizes and all seven compact entries visible. At roomy lower zoom the same planner leaves all 18 vertical entries on one page.
- Title, play, map, sidebar page 2, character sheet, help, and desktop play were inspected from real Electron screenshots under .test-out/final5. The map and text-heavy screens were centered, complete, and scroll-free; the map footer showed the full "Hit any key to continue" prompt.
