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

- **In the game** — Mods → **Install a mod...**, which fetches this repository at a
  release tag and checks every file against a SHA-256 that ships inside the game. A
  replaced tag or an intercepted download fails rather than runs. This is the path that
  works in every browser, including the ones with no directory picker.
- **A folder** — clone this repository into your mods directory, or point the browser
  build at it with **Load mod folder**.

`plugin.js` is generated from `plugin.ts` in this repository. It is committed because
that is what an install fetches. Edit the source, not this file — and if you are
reading it to decide whether to trust it, that is exactly why it ships unminified.

## Working on it

The source lives here now, and so do the tests. They boot a **real game** against the
published engine (`@rpgm-tools/neo-angband-core`) rather than a fake, because a
convenience proven against a hand-built cave is a convenience proven against a fixture.

```bash
npm install
```

```bash
npm run verify
```

That typechecks, runs the tests, and confirms the committed `plugin.js` is a current
build of the source — the last one matters more than it looks. The catalogue's SHA-256
is taken **from** `plugin.js`, so a stale artefact verifies perfectly and is the file
players actually run.

One external dependency, and it is a checkout rather than a package: the game's content
pack (Angband 4.2.6 gamedata, which the tests generate levels from) and the plugin
builder both live in the game's repository. Clone
[neo-angband](https://github.com/neostryder/neo-angband) as a sibling of this
directory, or set `NEO_ANGBAND_REPO` to where it already is. The engine itself comes
from npm; only the pack and the build tool need the checkout.

```bash
npm run build     # rebuild plugin.js after editing plugin.ts
```

### Testing against an unreleased engine

By default the tests import the **published** engine from `node_modules` - the
version a player runs, which is the right default and the reason the dependency
is pinned rather than linked. When you need to run against an engine change that
has not shipped yet:

```bash
NEO_ANGBAND_LOCAL_CORE=1 npm test
```

That resolves `@rpgm-tools/neo-angband-core` to `packages/core/dist` in the sibling
checkout (build it first). It is a separate variable from `NEO_ANGBAND_REPO` on
purpose: nearly everyone here has the checkout already, so keying off its presence
would silently swap the engine under every run. If `NEO_ANGBAND_REPO` is set it is
authoritative - a wrong path fails rather than falling back to a checkout you did
not name.

## Licence

Same dual licence as Neo Angband and Angband — GPL v2 or the Angband licence. See
[LICENSE.md](LICENSE.md).

## Credits

Built by neostryder / RPGM Tools as part of Neo Angband. Auto-dig is ported from
neostryder's own Angband fork. Angband is the work of Ben Harrison, James E. Wilson,
Robert A. Koeneke and the Angband contributors.
