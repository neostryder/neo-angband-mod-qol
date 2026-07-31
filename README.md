# qol — Quality of Life

Conveniences for [Neo Angband](https://github.com/neostryder/neo-angband) that are
**not** part of faithful Angband, as a mod.

**This is a mod.** It is off until you enable it, every tweak inside it is a named
switch you can turn off on its own, and disabling the mod leaves the game exactly as
Angband 4.2.6 plays it.

## What it is not

It does not touch Angband's own options. Those ship in the game with their upstream
defaults, and this mod has no opinion about them — if you want `auto_more` or
`show_damage`, they are in the game's Options screen and always were. What is here is
behaviour Angband does not have.

## What it adds

| Toggle | Default | What it does |
|---|---|---|
| **Auto-dig on walk** (`qol.autoDig`) | on | Walking into a rubble pile or mineral vein you can tunnel through starts digging, instead of just bumping into it. You still stop after each attempt and never step onto the dug-out square in the same move. |

One tweak, honestly. The mod exists as its own repository because a mod that is going
to grow should not need a game release to do it, and because a third-party mod and a
first-party one should be the same shape — installed by the same code, gated by the
same checks.

### Why auto-dig is a mod and not a fix

Faithful 4.2.6 spends no energy when you walk into diggable terrain: you bump it and
nothing happens. That is not a bug, it is what the C does
(`move_player`, `cmd-cave.c`), and Neo Angband's rule is that core keeps the warts. So
the behaviour lives here, and it lives here *completely* — there is no `qol.autoDig`
string and no dig-on-walk branch anywhere in the engine. Delete this mod and the code
is gone, not merely switched off.

It reaches two of the engine's own public functions rather than reimplementing them
(`movementTunnelTest` for the decision, `tunnelAux` for the attempt), because a
reimplemented dig roll would drift from the tunnel command's. The decision half draws
no randomness, so a walk this mod declines to handle leaves the RNG stream exactly
where faithful core would — which is what makes it safe to enable partway through a
character.

## Installing

Two files: `manifest.json` and `plugin.js`. Any of:

- **In the game** — Mods → install, once this repository has a release tag the game
  ships a digest for. That path verifies the bytes against a hash built into the game,
  so a replaced tag or an intercepted download fails rather than runs.
- **A folder** — clone this repository into your mods directory, or point the browser
  build at it with **Load mod folder**.

`plugin.js` is generated from TypeScript in the main repository
(`packages/web/mods/qol/plugin.ts`, built by
`packages/web/scripts/build-mod-plugins.mjs`). It is committed here because that is
what an install fetches. Edit the source, not this file — and if you are reading it to
decide whether to trust it, that is exactly why it ships unminified.

## Where the tests are

In the main repository, at `packages/web/mods/qol/plugin.test.ts`, where they run on
every push against the real engine — including a round-trip test
(`packages/web/src/mod-plugin-build.test.ts`) that builds this `plugin.js`, loads it
through the game's own folder loader, and checks it installs the same hooks the
in-tree copy does. Tests that travel to a repository with no engine to test against
are tests that stop running.

## Licence

Same dual licence as Neo Angband and Angband — GPL v2 or the Angband licence. See
[LICENSE.md](LICENSE.md).

## Credits

Built by neostryder / RPGM Tools as part of Neo Angband. Auto-dig is ported from
neostryder's own Angband fork. Angband is the work of Ben Harrison, James E. Wilson,
Robert A. Koeneke and the Angband contributors.
