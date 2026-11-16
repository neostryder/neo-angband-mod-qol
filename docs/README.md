# Quality of Life: quick reference

Conveniences that faithful Angband does not have. Angband's own options are core
and are not touched here.

This page is the short version: every setting, what the mod asks the game for,
and where the longer material is. The account of why each of these exists is in
[the repository README](../README.md).

## Settings

The Mods screen shows each setting's full description. The identifier names a rule flag, a section, or a numeric setting.

| Setting | Identifier | Default | What it does |
| --- | --- | --- | --- |
| Random artifact set size | `qol.randartSetSize` | 1x | Requests 1x through 4x the randomizable artifact count with inverse per-artifact allocation chances for the next new character. Core startup currently ignores the multiplier; see [QOL-390](API2-GAPS.md). |
| Memorial epigraphs | `qol.memorialEpigraphs` | off | Adds a one-line epigraph to end screens and the character dump. |
| Pause after object feeling | `qol.pauseObjectFeeling` | off | Waits for a key after the object part of a level feeling. |
| Context help | `qol.contextHelp` | off | Explains the selected action in the item context menu and command browser. |
| Rejoin wrapped prose | `qol.rejoinProse` | off | Rewraps hard-wrapped paragraphs in prose help pages, semantic prose, character backgrounds, and item flavor text. |
| Richer weapon and armor shops | `qol.richerShops` | off | The poorest Armoury and Weaponsmith owners pay up to 10000 gold per item. |
| Fragile town books | `qol.fragileTownBooks` | off | Fire and acid can destroy town spell books, while dungeon books stay protected. |
| Fragile food | `qol.fragileFood` | off | Fire and acid can destroy food and mushrooms. |
| No lava in town | `qol.noTownLava` | off | An optional setting that turns town lava into granite and leaves the rest of the town and the dungeon alone. |
| Gear comparison | `qol.gearComparison` | off | Gear comparison shows how wearing a known item in a slot would change your character, with before, after, and delta values from the game. |
| Loadouts | `qol.loadouts` | off | Loadouts save named sets of worn gear in this character's save and put them back on with ordinary wear and take-off commands. |
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

- **Mod API:** `>=2.4.0 <3.0.0`
- **Engine:** `>=1.23.0-beta.1`
- **Shape:** `content`
- **Facets:** `content`, `plugin`
- **Capabilities:** `backup:folder`, `ui:panel.mount`, `keymap:write`, `registry:menu`, `registry:command`, `registry:ui-entry`, `registry:message`, `registry:randart-size`, `state:player.read`, `state:inventory.read`, `state:interaction.read`, `input:intent`, `state:floor.read`, `state:stores.read`, `state:spells.read`, `engine:access`

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
