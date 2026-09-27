# Quality of Life: quick reference

Conveniences that faithful Angband does not have. Angband's own options are core
and are not touched here.

This page is the short version: every setting, what the mod asks the game for,
and where the longer material is. The account of why each of these exists is in
[the repository README](../README.md).

## Settings

Each one is a named toggle on the game's own Mods screen, which shows the full
description. The identifier is the name a save and another mod see; where a
switch has no flag of its own, the game knows it by its section id instead.

| Setting | Identifier | Default | What it does |
| --- | --- | --- | --- |
| Auto-dig on walk | `qol.autoDig` | on | Walking into a rubble pile or mineral vein you can tunnel through starts digging automatically, instead of just bumping into it. |
| Remember my settings | `qol.rememberSettings` | on | Changes you make in the '=' options menu are kept, and every new character starts with them. |
| Keep reading a pref file past a mistake | `qol.forgivingPrefFiles` | on | Angband stops reading a pref file at the first line it cannot understand, so one typo near the top silently throws away everything below it, such as a whole graphics pack or the rest of your keymaps. |
| Remember cheat options too | `qol.rememberCheats` | off | Include the cheat options in what is remembered, so a new character starts with the ones you had on. |
| Misc. niceties | `qol.miscNiceties` | off | Bundle small independent display conveniences: an ellipsis for an overlong store item name, the selected store item's description on the message line, and a one-line colour key on the visible-monster list naming what each row colour means. It also makes clarity and wording improvements to upstream Angband's own descriptions and messages, listed in [TEXT_CHANGES.md](../TEXT_CHANGES.md). |
| Accessibility: activation shortcut helper | `qol.accessibilityMacroWizard` | off | When you learn a spell or gain a known activatable item, offer to bind the casting or activation command to an unused shortcut key. |
| Accessibility: repeated-action shortcuts | `qol.accessibilityRepeatShortcuts` | off | Offer an unused one-key shortcut for resting as needed. |
| Purge queued input | `qol.purgeQueuedInput` | off | Claim an unused key (F2) that sends Escape for you, enough presses at once to back out of several stacked menus or prompts. |
| Quality ignore: always ignore torches | `qol.ignoreTorches` | off | Treat every Wooden Torch as ignored, independently of the light-source quality tier and of the matching lantern toggle. |
| Quality ignore: always ignore lanterns | `qol.ignoreLanterns` | off | Treat every Lantern as ignored, independently of the light-source quality tier and of the matching torch toggle. |

Zoom and pan, hover cards on the Map overview, first-encounter alerts, the itemized quiver, sharper shrunken tiles, and the enlarged, high-contrast and colourblind displays are now part of the [AnybandUI](https://github.com/neostryder/neo-angband-mod-anybandui) mod, where each has its own switch.

## What it needs

- **Engine:** `>=1.8.0`
- **Shape:** `content`
- **Facets:** `content`, `plugin`
- **Capabilities:** `backup:folder`, `ui:panel.mount`, `keymap:write`, `registry:menu`

What a capability string permits, and what a mod that asks for one cannot do
without it, is in [the mod lifecycle
document](https://github.com/neostryder/neo-angband/blob/master/docs/modding/MOD_LIFECYCLE.md).

## Elsewhere

- [README](../README.md), the full account
- [Changelog](../CHANGELOG.md), what changed in each version
- [What belongs in this mod, and
  why](https://github.com/neostryder/neo-angband/blob/master/docs/modding/QOL.md),
  in the game's own repository
- [Installing a
  mod](https://github.com/neostryder/neo-angband/blob/master/docs/MODS.md), the
  route every mod installs by
