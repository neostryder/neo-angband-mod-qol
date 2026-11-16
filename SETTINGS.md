# Settings reference

A rule that needs a reload is read once, when the game starts. The others take effect when you change them.

| Flag | Default | What it does | Reload required |
| --- | --- | --- | --- |
| `qol.randartSetSize` | 1x | Requests 1x, 2x, 3x, or 4x the randomizable artifact count with inverse per-artifact allocation chances. Fixed artifacts and saved sets stay unchanged. Core startup currently ignores the multiplier; see [QOL-390](docs/API2-GAPS.md). | Yes; intended for the next new character with random artifacts enabled. |
| `qol.memorialEpigraphs` | off | Adds a one-line epigraph picked for the ending to the end screen and the character dump, with the same line in both. | Yes. |
| `qol.pauseObjectFeeling` | off | Waits for a key after the object part of a level feeling unless Auto-more is on. | Yes. |
| `qol.contextHelp` | off | Shows a one-line explanation under the selected action in the item context menu and the command browser. | Yes. |
| `qol.rejoinProse` | off | Rewraps hard-wrapped paragraphs in prose help pages, semantic prose, character backgrounds, and item flavor text to the screen width, and leaves tables, art, and aligned lines as laid out. | Yes. |
| `qol.richerShops` | off | Raises the poorest Armoury and Weaponsmith owners' limits from 5000 to 10000 gold per item. | Yes. |
| `qol.fragileTownBooks` | off | Lets acid destroy town spell books, while dungeon books stay protected. | Yes. |
| `qol.fragileFood` | off | Lets fire and acid destroy food and mushrooms. | Yes. |
| `qol.noTownLava` | off | Turns lava in the town into granite. | Yes. |
| `qol.gearComparison` | off | Adds "Compare gear..." to the Game menu to show how an item would change your character in a worn slot. | Yes. |
| `qol.loadouts` | off | Adds "Loadouts..." to the Game menu for saving named sets of worn gear and putting them back on. | Yes. |
| `qol.autoDig` | on | Starts digging when walking into diggable rubble or a vein. | No. |
| `qol.rememberSettings` | on | Saves options menu choices and restores them for new characters. | Yes. |
| `qol.forgivingPrefFiles` | on | Continues reading a pref file after invalid lines. | Yes. |
| `qol.rememberCheats` | off | Includes cheat options in remembered settings. | Yes. |
| `qol.accessibilityMacroWizard` | off | Offers shortcuts for newly learned spells and activations. | Yes. |
| `qol.accessibilityRepeatShortcuts` | off | Offers a shortcut for resting as needed. | Yes. |
| `qol.purgeQueuedInput` | off | Claims an unused key (F2) that sends Escape for you. | Yes. |
| `qol.ignoreTorches` | off | Always treats Wooden Torches as ignored, independently of the quality-ignore tier and of `qol.ignoreLanterns`. | Yes. |
| `qol.ignoreLanterns` | off | Always treats Lanterns as ignored, independently of the quality-ignore tier and of `qol.ignoreTorches`. | Yes. |
| `qol.miscNiceties` | off | Shows an ellipsis for an overlong store item name, the selected store item's description while browsing, a colour key on the visible-monster list, and clearer wording in upstream text. | Yes. |

