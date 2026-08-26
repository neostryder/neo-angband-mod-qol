# Changelog

All notable changes to this mod are recorded here. Versions follow the mod's own
`manifest.json`, which is what the game reads, and each released version has a
matching git tag that an install pins itself to.

An entry has to matter to somebody running the mod. Documentation wording,
internal refactoring and test-only additions are not recorded here. Bug fixes
are, however small.

## Unreleased

### Added

- Hover cards on the Map overview (`qol.mapHoverCards`, off by default):
  resting the mouse over an object or a creature on the `M` screen shows a
  card describing what you currently know about it, gated by the same
  identify/memory rules the main screen uses. Objects and creatures only,
  not plain terrain. Desktop with a mouse; a touch-only device leaves this
  off regardless of the toggle.

## 0.15.3

Added a Terms of Use and a shared Code of Conduct alongside the existing
LICENSE policy, and a README screenshot of the mod's enable prompt.

## 0.15.2

### Fixed

- The development lockfile resolved a `nanoid` version covered by an npm High
  advisory (custom generators can loop indefinitely when size is zero) through
  a transitive PostCSS dependency. `nanoid` is a development-only dependency
  not reachable from any shipped code path in this mod; the lockfile now
  resolves the fixed version.

## 0.15.1

### Fixed

- The install section claimed the game checks every file against a SHA-256 that
  ships inside it, and that a replaced tag or an intercepted download therefore
  fails rather than runs. The game does not do that. It records a digest of the
  bytes that arrived, which answers whether the copy on your machine has changed
  since it was installed, and cannot answer whether what arrived is what was
  published here. What the install does give is a pinned tag rather than a
  branch, so what arrived cannot change under you afterwards. The README ships
  inside the installed mod, so this correction needs a release to reach anybody
  who already has it.

## 0.15.0 - 2026-08-15

### Added

- **Keep reading a pref file past a mistake** (on). Angband 4.2.6 prints one
  error and abandons the whole file on the first bad line, which is how a
  graphics pack with a single typo in it silently half-loads. This applies the
  whole file and limits only how many errors it tells you about.
- The engine range stays at `>=0.18.0` rather than rising to gate this one
  toggle. An older engine has no error-policy seam, and refusing the whole mod
  would cost a player auto-dig and remembered settings to buy this. So the toggle
  degrades on an older host and says so in the log rather than sitting switched
  on while doing nothing.

## 0.14.0 - 2026-08-06

### Added

- `manifest.json` declares its `repository`. This is the field an import reads:
  install the mod from a `.zip` and the copy on disk pins itself to the
  repository its own manifest names. Without it an imported copy binds to
  `file:import`, and the update check has no repository to ask, so the one
  install route that does not start at a repository produced the one copy that
  could never be updated.

### Changed

- `author` is `neostryder` rather than `neostryder (RPGM Tools)`. The mod list
  already trimmed the parenthesis, and the detail pane printed the full string,
  where it read as two names for one person.

## 0.13.0 - 2026-08-02

### Added

- **Remember my settings** (on). Angband keeps a character's options inside that
  character's save and nowhere else, so they die with the character and every new
  life begins by setting them all again. This stores what you chose in the `=`
  menu and applies it to the next character you create. Upstream's answer is the
  pref file, which is a file you have to know exists and remember to write.
- **Remember cheat options too** (off). Switching a cheat option on forces its
  score twin and permanently bars that character from the score list, so
  inheriting one unasked is the single case where remembering does damage. Opt-in
  for that reason.
- Three kinds of option are excluded, and the filter runs on the way in as well
  as on the way out, so switching a toggle off takes effect against what is
  already stored rather than only against what is stored next. Birth options are
  frozen at character creation and already carry forward by the game's own route.

### Requires

- Engine 0.18.0 or newer, for the options-changed hook, storage that outlives a
  character, and the new-character hook. None of those seams names this mod.

## 0.12.0 - 2026-08-01

### Changed

- The description is rewritten as short paragraphs. The previous one was long
  enough to squeeze the mod manager's list down to a single visible row with no
  way to scroll it. Nothing about what the mod does changed. The manager's own
  half of that problem is fixed in the game: the pane is capped, and a "Read the
  full description" row opens the whole thing in a viewer that scrolls.

## 0.11.0 - 2026-08-01

### Added

- `engine` is declared as `>=0.10.0`. This mod ships a `plugin.js`, and a plugin
  is exactly the case where the game's own version is load-bearing. An absent
  range is allowed, and right, for a pack that is pure data.

### Changed

- The gamedata and the plugin builder come from npm rather than from a sibling
  checkout of the game. The test suite now proves this mod against exactly what a
  third-party author would install, and `plugin.js` is built from a pinned copy
  of the builder rather than from whatever is in a neighbouring working tree.

## 0.10.0 - 2026-07-31

### Changed

- **The mod is no longer bundled inside the game, and its source lives here.**
  The game used to ship this mod inside its own build with only the built
  `plugin.js` copied to this repository, which made this repository a publishing
  target rather than the mod's home: nothing here could be built, tested or
  typechecked on its own. The repository root is the mod folder, so
  `manifest.json` and `plugin.js` sit beside the source they come from, which is
  the pair the game fetches.
- The version was `1.0.0`, ahead of a game at `0.10.0`, and the description still
  called the mod bundled. Both corrected.

### Fixed

- The mod had never been typechecked. Its previous home was outside the game's
  `tsconfig` include list, so it was transpiled, which strips types without
  checking them. A reference to a type with no import had been sitting in the
  test the whole time.
