# qol: Quality of Life

Conveniences for [Neo Angband](https://github.com/neostryder/neo-angband) that are
**not** part of faithful Angband, as a mod.

**This is a mod.** It is off until you enable it, every tweak inside it is a named
switch you can turn off on its own, and disabling the mod leaves the game exactly as
Angband 4.2.6 plays it.

## What it is not

It does not touch Angband's own options. Those ship in the game with their upstream
defaults, and this mod has no opinion about them: if you want `auto_more` or
`show_damage`, they are in the game's Options screen and always were. What is here is
behaviour Angband does not have.

## What it adds

| Toggle | Default | What it does |
|---|---|---|
| **Auto-dig on walk** (`qol.autoDig`) | on | Walking into a rubble pile or mineral vein you can tunnel through starts digging, instead of just bumping into it. You still stop after each attempt and never step onto the dug-out square in the same move. |
| **Remember my settings** (`qol.rememberSettings`) | on | Changes you make in the `=` options menu are kept, and every new character starts with them. Your existing characters are never touched. |
| **Remember cheat options too** (`qol.rememberCheats`) | off | Include the cheat options in what is remembered. Off by default, because a cheat option permanently bars that character from the score list. |
| **Keep reading a pref file past a mistake** (`qol.forgivingPrefFiles`) | on | Angband stops reading a pref file at the first line it cannot understand, throwing away everything below it. With this on the file is read to the end and the bad lines are skipped. You are told about the first 20 mistakes. |

The mod exists as its own repository because a mod that is going to grow should not
need a game release to do it, and because a third-party mod and a first-party one
should be the same shape, installed by the same code, gated by the same checks.

**From 0.13.0 this mod needs engine 0.18.0 or later** (`"engine": ">=0.18.0"`), and
the game refuses to load it on anything older rather than showing you two toggles it
cannot honour. 0.12.0 remains the version for a 0.17.0 game.

### Why remembering settings is a mod and not a fix

Angband keeps a character's options inside that character's save and nowhere else, so
they die with the character, and every new life starts by setting them all again.
Upstream's answer is the pref file (`s` / `r` in the options menu), a file you have to
know exists and remember to write. That is not a bug either, so core keeps it, and the
convenience lives here.

It needs three things from the engine, and all three are general seams rather than
anything named after this mod: `ModHooks.optionsChanged` (the game says when you have
finished changing settings), `ctx.prefs` (somewhere to keep data that outlives a
character; the mod's save bag is *inside* the save and dies with it), and
`ctx.newCharacter` (whether this character was just created, which a mod cannot work
out for itself because the game autosaves the moment one is born).

Three deliberate exclusions. **Birth options** are frozen at creation and the engine
refuses to change them afterwards, and they already carry forward by the game's own route,
because the birth options editor is seeded from your last character. **Cheat and score
options** are excluded unless you turn the second toggle on: switching a cheat option
on forces its `score_` twin, which permanently bars that character from the high score
list, and inheriting that without being asked is the one case where remembering a
setting does real damage. The filter applies when settings are read back as well as
when they are stored, so turning the toggle off takes effect against what is already
saved.

### Why reading past a mistake is a mod, and why it used to be in the game

Angband 4.2.6 stops dead at the first line of a pref file it cannot parse:
`process_pref_file_named` prints one error and breaks out of the read loop
(`ui-prefs.c`). One typo near the top of a converted graphics pack therefore
costs you the whole rest of the pack, silently. That is a wart, not a bug, so
core keeps it.

The engine used to be forgiving instead: it carried a twenty-error cap of its
own, with an environment variable to change it. A citation sweep found no such
thing anywhere in Angband 4.2.6, which made it an improvement the port had added
rather than a behaviour it had reproduced, and the port adds nothing. So it was
removed from the engine and rebuilt here, better than it was: the old cap still
threw away everything below the twentieth error, and this one applies the entire
file and only limits what you are **told**.

It needs one general seam, named after nothing in this mod:
`setPrefErrorPolicy`. It is a module-level policy rather than a `ModHooks`
member because the three readers it governs (the `=` menu's "Load a user pref
file", a mod's own `prefs` resource and the graphics pack loader) have no game
state to hang a hook on, and two of them run before there is a game at all.

### Why auto-dig is a mod and not a fix

Faithful 4.2.6 spends no energy when you walk into diggable terrain: you bump it and
nothing happens. That is not a bug, it is what the C does
(`move_player`, `cmd-cave.c`), and Neo Angband's rule is that core keeps the warts. So
the behaviour lives here, and it lives here *completely*: there is no `qol.autoDig`
string and no dig-on-walk branch anywhere in the engine. Delete this mod and the code
is gone, not merely switched off.

It reaches two of the engine's own public functions rather than reimplementing them
(`movementTunnelTest` for the decision, `tunnelAux` for the attempt), because a
reimplemented dig roll would drift from the tunnel command's. The decision half draws
no randomness, so a walk this mod declines to handle leaves the RNG stream exactly
where faithful core would, which is what makes it safe to enable partway through a
character.

## Installing

Two files: `manifest.json` and `plugin.js`. Any of:

- **In the game** - Mods -> **Install a mod...**, which fetches this repository at a
  release tag, never a branch, so what arrives cannot change under you afterwards. The
  install records a SHA-256 of every byte that arrived, which is what lets the manager
  answer later whether the copy on your machine has changed. It cannot tell you whether
  what arrived is what was published here, there being nothing to compare a first
  download against. This is the path that works in every browser, including the ones
  with no directory picker.
- **A folder** - clone this repository into your mods directory, or point the browser
  build at it with **Load mod folder**.

`plugin.js` is generated from `plugin.ts` in this repository. It is committed because
that is what an install fetches. Edit the source, not this file, and if you are
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
build of the source, and the last one matters more than it looks. An install fetches the
committed `plugin.js` from a pinned tag and runs it as it is; nothing rebuilds it on the
way in. So a stale artefact passes every other check and is the file players actually
run, and `npm run check` is the only thing that looks.

No checkout of the game is needed. The engine, the content pack (Angband 4.2.6
gamedata, which the tests generate levels from) and the plugin builder are all
published packages, so `npm ci` is the whole setup and the suite proves this mod
against exactly what a third-party author would install. A sibling checkout of
[neo-angband](https://github.com/neostryder/neo-angband), or `NEO_ANGBAND_REPO`
pointing at one, is an override for developing against an engine change that has not
reached the registry yet.

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

## Questions, or something wrong

[**The RPGM Tools Discord**](https://discord.gg/YegtwbHTBQ) is the fastest way
to ask anything - whether a behaviour is intended, how to get this installed,
or what you should try next. No GitHub account needed.

[Open an issue here](../../issues/new/choose) for a bug in **this mod**. Two
things belong against the game instead, and the forms will point you there: the
mod **system** (an install that fails, a load order that will not stick, a
conflict report that looks wrong), and the game **not matching Angband 4.2.6**
once this mod is switched off - changing the game is what a mod is for.

For anything that should not be public, including a security report:
**strider-angband (at) rpgm.tools**. See
[SECURITY.md](https://github.com/neostryder/neo-angband/blob/master/SECURITY.md).

Asking about AI use in this project? [AI_USAGE_POLICY.md](https://github.com/neostryder/neo-angband/blob/master/AI_USAGE_POLICY.md)
in the main repository is the complete answer.

## Licence

Same dual licence as Neo Angband and Angband: GPL v2 or the Angband licence. See
[LICENSE.md](LICENSE.md).

## Credits

Built by neostryder / RPGM Tools as part of Neo Angband. Auto-dig is ported from
neostryder's own Angband fork. Angband is the work of Ben Harrison, James E. Wilson,
Robert A. Koeneke and the Angband contributors.
