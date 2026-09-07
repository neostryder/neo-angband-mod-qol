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
| Keep reading a pref file past a mistake | `qol.forgivingPrefFiles` | on | Angband stops reading a pref file the moment it hits a line it cannot understand, so one typo near the top silently throws away everything below it - a whole graphics pack, or the rest of your keymaps. |
| Remember cheat options too | `qol.rememberCheats` | off | Include the cheat options in what is remembered, so a new character starts with the ones you had on. |
| Hover cards on the Map overview | `qol.mapHoverCards` | off | On the (M)ap overview screen, resting the mouse on a cell for two seconds (or holding for one second on touch) shows a card with a magnified tile and whatever you currently know about that cell - terrain, creature, item, trap, shop, or your own character. |
| First-encounter alerts | `qol.firstEncounterAlerts` | off | The first time this character meets a monster type, or picks up an artifact, a small card appears in the corner of the screen with its name and native depth. |
| Zoom, pan, and responsive layout | `qol.zoomPan` | on | Use a real responsive grid whose visible rows and columns change with zoom. |
| Sharpen zoomed graphics | `qol.sharpenZoomedTiles` | off | Use crisp nearest-neighbour sampling for graphics tiles even when they are being reduced. |
| Accessibility: enlarged display | `qol.accessibilityZoom` | off | Use the responsive display at a larger, more readable default cell size. |
| Accessibility: high-contrast display | `qol.accessibilityHighContrast` | off | Boost contrast and colour separation after the game has rendered each frame. |
| Accessibility: colourblind correction | `qol.accessibilityColorblind` | off | Apply a red-green daltonization correction after the game has rendered each frame. |
| Accessibility: activation shortcut helper | `qol.accessibilityMacroWizard` | off | When you learn a spell or gain a known activatable item, offer to bind the casting or activation command to an unused shortcut key. |
| Accessibility: repeated-action shortcuts | `qol.accessibilityRepeatShortcuts` | off | Offer unused one-key shortcuts for resting as needed and, in the original keyset, running in each cardinal direction. |

## What it needs

- **Engine:** `>=1.8.0`
- **Shape:** `content`
- **Facets:** `content`, `plugin`
- **Capabilities:** `backup:folder`, `ui:sidebar.replace`, `display:filter`,
  `ui:panel.mount`, `keymap:write`, `registry:menu`

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
