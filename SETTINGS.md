# Settings reference

Rules marked hooks side are rebuilt when changed. Rules marked register side need a reload because registration runs only at startup. The preference file rule sets a global policy from its hook, so turning it off also needs a reload.

| Flag | Default | What it does | Reload required |
| --- | --- | --- | --- |
| `qol.autoDig` | on | Starts digging when walking into diggable rubble or a vein. | No, hooks side. |
| `qol.rememberSettings` | on | Saves options menu choices and restores them for new characters. | Yes, register side restore. |
| `qol.forgivingPrefFiles` | on | Continues reading a pref file after invalid lines. | Yes, to turn it off. |
| `qol.rememberCheats` | off | Includes cheat options in remembered settings. | Yes, register side restore. |
| `qol.mapHoverCards` | off | Shows knowledge limited cards for cells on the Map overview. | Yes, register side. |
| `qol.firstEncounterAlerts` | off | Shows a card for first monster encounters and artifacts. | Yes, register side. |
| `qol.zoomPan` | on | Enables responsive zoom and pan controls for the game display. | Yes, register side. |
| `qol.sharpenZoomedTiles` | off | Uses crisp sampling for reduced graphics tiles and shows every known dungeon grid on the Map overview, smoothly reduced to fit in ASCII and graphics modes. | Yes, register side. |
| `qol.accessibilityZoom` | off | Starts the responsive display at a larger cell size. | Yes, register side. |
| `qol.accessibilityHighContrast` | off | Applies a high contrast filter to rendered frames. | Yes, register side. |
| `qol.accessibilityColorblind` | off | Applies red green colour correction to rendered frames. | Yes, register side. |
| `qol.accessibilityMacroWizard` | off | Offers shortcuts for newly learned spells and activations. | Yes, register side setup. |
| `qol.accessibilityRepeatShortcuts` | off | Offers a shortcut for resting as needed. | Yes, register side. |
| `qol.purgeQueuedInput` | off | Claims an unused key (F2) that sends Escape for you. | Yes, register side. |
| `qol.ignoreTorches` | off | Always treats Wooden Torches as ignored, independently of the quality-ignore tier and of `qol.ignoreLanterns`. | Yes, register side. |
| `qol.ignoreLanterns` | off | Always treats Lanterns as ignored, independently of the quality-ignore tier and of `qol.ignoreTorches`. | Yes, register side. |
