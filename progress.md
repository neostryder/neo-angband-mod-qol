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
