# Settings reference

A rule that needs a reload is read once, when the game starts. The others take effect when you change them.

| Flag | Default | What it does | Reload required |
| --- | --- | --- | --- |
| `qol.birthOptionAnnotations` | off | Birth options get a D if they change difficulty, I if they change which items appear, or D/I for both, and the selected one gets a hint. None turns off scoring directly. | No. |
| `qol.birthConfirmOptions` | off | Before the final key that starts your character, a screen lists every birth option that differs from its default. One key continues, Escape goes back, and S starts over. | No. |
| `qol.attunement` | off | Adds a Staff of Attunement from depth 20 and a rarer Rod of Attunement from depth 50, both dungeon-only unless Attunement in stores is on. Each use teaches one unknown rune on a wearable item or identifies one unknown flavor. | Yes. |
| `qol.attunementStores` | off | With Attunement devices on, the staff and rod can also turn up in random store stock, black market included. Items already on shelves or sold do not change. | Yes. |
| `qol.randartSetSize` | 1x | Builds 1x, 2x, 3x, or 4x the usual number of randomized artifacts and lowers each one's chance to appear by the same factor. Fixed artifacts and sets already generated for saved characters do not change. | Yes, from the next new character with random artifacts on |
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

