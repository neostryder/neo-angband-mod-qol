# Quality of Life API 2 migration

Quality of Life keeps its API 1 entry while its manifest uses schema 2. The converter sets `runtime` to `in-process` and keeps the API range within major version 1. All toggles, content files and grants keep their previous values. The SDK validator reads the converted manifest as `modApi: 1` with entry `plugin.js`.

The twin in `core-adapter-api2.ts` accepts a `ModApi2` and exports `createAdapter`, matching the existing factory name. It reads metadata and forwards preference calls and key binding. The storage and binding calls return promises with the SDK's result types. Only this part of the adapter has direct replacements today. The running plugin still imports `core-adapter.ts`, so changing that import also requires callers to await these results and supply the missing engine and host operations.

## Gap table

The table covers the members used by the adapter and plugin. An API 2 home means the member can move once the entry loads through API 2. Core request rows identify calls whose current effects need another host operation.

| Old member | API 2 home or Core request | Notes |
| --- | --- | --- |
| Plugin `api: 1` | Definition `api` range | CR1 blocks the entry change. |
| Plugin `hooks(ctx)` | Definition `hooks({ id, flags })` | The composition call still installs auto-dig and preference policy through the old context. |
| Plugin `register(host, ctx)` | Definition `start(mod)` | Startup maps to start, with the menu host covered by CR12. |
| Plugin `uninstall()` | Definition `stop()` | The current cleanup functions can stay together. |
| `ctx.flags` | `meta.flags` | The twin reads the same toggle map. |
| `ctx.newCharacter` | `meta.newCharacter` | Both adapters treat an absent old-context value as false. |
| `ctx.log(message)` | `meta.log(message)` | Diagnostics go to the host's log. |
| `ctx.prefs.get()` | `store.prefs.get()` | The result contains the stored JSON, including former preference shapes. |
| `ctx.prefs.set(value)` | `store.prefs.set(value)` | The twin forwards writes and clearing with null. |
| `ctx.keymaps.bind(trigger, action)` | `ui.keys.bind(trigger, action)` | A taken key returns `refused` rather than false. |
| `ctx.keymaps.isBindableTriggerKey(trigger)` | Core request CR8 | The mod checks a candidate without binding it. |
| `ctx.ui.openPanel({ id, modal, label })` | Core request CR10 | The current mount call has no modal flag or editable control. |
| Panel `root` | Core request CR10 | Both cards edit keys. The repeat card also changes a checkbox and disables a bound button. |
| Panel `closed` | Core request CR10 | Dismissal finishes a wizard offer or releases the repeat card. |
| Panel `close()` | Core request CR10 | Hiding a panel through patch leaves its mounted id occupied. |
| `ctx.core.movementTunnelTest(state, grid)` | Core request CR2 | This test declines before the dig draws RNG. |
| `ctx.core.tunnelAux(state, grid, deps)` | Core request CR2 | Core performs the dig with the session's `CaveCmdDeps`. |
| `walkBlockedByDiggable` live `state`, `grid`, `deps` | Core request CR1, CR2 | These live arguments remain behind the engine adapter. |
| Hook state `z.moveEnergy` | Core request CR2 | Each handled attempt costs a move, including a failed dig. |
| `ctx.core.setPrefErrorPolicy(policy)` | Core request CR3 | Graphics and preference loading can run before startup. |
| `new ctx.core.OptionState()` and `isBirth/isCheat/isScore` | Core request CR4 | The temporary table supplies category predicates. |
| `ctx.state.options.set(name, value)` | Core request CR5 | The boot-time setter keeps Core's cheat/score coupling. |
| `ctx.state.options.hitpointWarn/delayFactor/lazymoveDelay` writes | Core request CR5 | The adapter writes these through `startingOptions.setNumbers`. |
| `ctx.core.TV.LIGHT` | Core request CR6 | A symbolic item-class code can replace the constant. |
| `ctx.state.isIgnored` read and replacement | Core request CR6 | Existing ignore decisions remain the fallback. |
| `ctx.display.setStoreItemNameEllipsis` | Core request CR7 | Store-name overflow uses the host's drawing. |
| `ctx.display.setStoreSelectionDescription` | Core request CR7 | Store selection adds an item description to the message line. |
| `ctx.display.setMonsterListColorKey` | Core request CR7 | The visible-monster list includes its color key. |
| `ctx.display.onKey(listener)` and its unsubscribe | Core request CR9 | The listener consumes unmodified F2 before default handling. |
| `ctx.keyRepeat()` | Core request CR9 | Purging depends on the host's repeat test for this press. |
| `ctx.backupFolder.choose()` | Core request CR11 | Folder selection returns a display name or null. |
| `ctx.backupFolder.write(name, text)` | Core request CR11 | The mirror writes the host's save text. |
| `ctx.backupFolder.onSave(listener)` | Core request CR11 | Save notifications start the write. |
| `ctx.backupFolder.list()` | Core request CR11 | The listing carries name, lineage, characterName and level. |
| Registry host `menus.addAction("core:game-menu", ...)` | Core request CR12 | This row opens the backup-folder picker. |
| Hook `walkBlockedByDiggable` | Core request CR2 | The hook runs synchronously inside movement. |
| Hook `optionsChanged(snapshot)` | Definition hook `optionsChanged` | Values and numeric settings match, with category filtering still blocked by CR4. |
| Hook `abilityGained(ability)` | Definition hook `abilityGained` | The mod reads name and command from plain data. Its card still waits for CR8 and CR10. |
| Hook `messageText(raw)` | Definition hook `messageText` | The wording function has no engine dependency. |

| Table status | Count |
| --- | --- |
| Moved into the running API 2 plugin | 0 |
| API 2 home awaiting wiring | 12 |
| API 1 entry awaiting CR1 | 1 |
| Core request | 26 |

The plugin has no controller or presentation members (`hud`, `menu`, `screen`, `birth`, `frontend`, `regions`). It reads no registry, raw snapshot or game-event subscription. Its menu dependency is the registry action in the table. The `ctx` variables in `bitmap-text.ts` refer to canvases.

## Core requests

### CR1: loading and retained engine access

API 2 folder loading needs to validate the definition's API range and call the in-process shim. The builder needs to accept that definition too. A P-tier allowlist grants a versioned domain such as `engine: { api, core, state?, registries? }`. Its fields expose documented aliases of the existing engine namespace, live state and registry host. These aliases need to exist during hook composition, before startup. The `walkBlockedByDiggable` fallback reads live engine data through `core` and `state`. Every tier can use the loader; only P-tier mods retain engine aliases and live hooks.

### CR2: digging on a blocked walk

Auto-dig fits a walk policy `{ kind: "walk-blocked-by-diggable", attempt: "tunnel", energy: "move", step: false }`. The host runs the current movement test and declines without a random draw. When it accepts the walk, it makes one tunnel attempt with its own dependencies and charges move energy even if the dig fails. The player stays on the original grid. Load order determines the policy contribution. Any tier can use a granted declaration. The live hook fallback requires P-tier engine access.

### CR3: preference error policy before startup

Preference loading uses `{ kind: "pref-errors", continueAfterError: true, reportLimit: 20 }` before any game exists. The host must install this policy during composition, ahead of graphics-pack and preference-resource loading. It keeps applying valid input after an error while limiting the reported errors. The policy follows mod load order and disappears when the mod stops contributing. The declaration can be granted to any tier, while a direct engine call is P-tier only.

### CR4: option categories as content

The classifier can read compiled option metadata through virtual `option` records in `content.records` and `content.lookup`. Each record contains `{ name, birth, cheat, score }` and uses the option name as its key. Core supplies these records before a character exists, replacing the temporary OptionState that classifies the captured settings. The records contain public option metadata and require no P-tier restriction.

### CR5: starting options and an option view

The missing option read can use `view.options()` with the existing `Api2Options` shape. A startup declaration `{ kind: "starting-options", values, hitpointWarn?, delayFactor?, lazymoveDelay? }` then applies remembered choices before play through Core's normal setters. It acts only on a new character, preserves cheat/score coupling, and retains the current birth filtering and unknown-option behavior. A loaded character keeps its saved choices. This declaration can serve any granted tier. Direct live state setters are P-tier only.

### CR6: light ignore policy

An ignore policy table can carry `{ tval: "light", kindNameContains: "Torch" | "Lantern", ignore: true }` for each enabled choice. Its host evaluation uses the current case-sensitive kind-name tests. Artifacts and inscriptions containing `!k` or `!*` fall through to the prior callback, as does every object outside the chosen light groups. A content item-class code replaces `TV.LIGHT`. The mod needs no truth read. All granted tiers can use the policy, and the live callback fallback stays P-tier only.

### CR7: host display choices

The host can apply `{ kind: "display-options", storeItemNameEllipsis: true, storeSelectionDescription: true, monsterListColorKey: true }` to its store and monster-list drawing. Teardown removes the choices so reinstalling follows the same sequence as the existing display setters. These display choices need no hidden-state access and can be offered outside P-tier.

### CR8: reading key availability

`ui.keys.isBindableTriggerKey(trigger)` can answer with a boolean under `keymap:write`. It has to check the same keyset and trigger validity as the API 1 call, and it must leave ownership alone. The wizard's suggested key comes from this read, and so do the repeat-card candidate and the purge-key check. Binding the key afterwards still checks for a collision. The grant can cover this read in every tier.

### CR9: purge input policy

The host can implement purge through a granted `{ kind: "purge-input", trigger: "F2", modifiers: [], freshOnly: true, escapeCount: 3 }` policy. It reserves F2 when nothing else is using it and does its own repeat classification. A repeated press is consumed, and a fresh press sends three ordinary Escape cancellations to clear any stacked menus. F2 stays out of the macro keymap. Building this on key events instead would need a `{ key, code, modifiers, isRepeat }` payload delivered before default handling, plus an unsubscribe handle and a cancellation action. Any tier with the grant can use the policy, while raw interception needs P-tier engine access.

### CR10: panels with editable controls and dismissal

The panel grammar needs a text-input node for trigger editing and a checkbox node for the repeat card's permanent dismissal. Both controls send value-change actions. A button needs a disabled field, and a panel needs modal placement. `ui.unmount(panelId)` and a dismissal notification release the mounted id and finish the wizard offer when a panel closes. The cards can then use the host's font while keeping their current choices and dismissal behavior. The panel grant covers these operations in every tier. Until then, the twin has no `panels` member.

### CR11: cloud backup folder

A backup-folder domain can wrap the existing `choose`, `write` and `list` calls in API 2 results. Its save subscription supplies the name and text to mirror, with an unsubscribe handle for teardown. The picker returns a display name or null, and the listing retains its current character metadata. The domain keeps the `backup:folder` permission without exposing a real filesystem path. That permission is available outside P-tier.

### CR12: a Game-menu action

The backup picker can register through `{ menu: "core:game-menu", action: "choose-backup-folder", label }` with a callback for selection. The host adds the row when the mod starts and removes it when the mod stops. The existing `registry:menu` grant remains until the declaration has a replacement grant. A declaration can serve any granted tier, while the mutable registry-host fallback remains P-tier only.

## SDK builder defect

The SDK builder needs to import `manifestFields` for its `readManifestId` call. The missing import throws an error that the catch block discards. The builder then uses the folder basename for the plugin banner, which is `overhaul-api2` in this worktree. Both manifest schemas take this path, so the banner depends on the checkout folder. The fix belongs in the SDK builder and applies to every tier.

## Removal list

`plugin.ts` stops receiving `engine.liveOptions`. It calls the category predicates and setters in `engine.startingOptions` instead, so the live OptionState stays inside the adapter. The temporary classifier that `engine.newOptionState` returns exposes nothing but its category predicates. Core still makes the same option writes.

All four grants stay in the current entry. Cloud backup depends on CR11, and its menu action on CR12. Key availability waits on CR8, purge on CR9 and editable panels on CR10, and the existing key bindings use `keymap:write` as well. For every other engine read or write, the Core requests it depends on are listed in its table row.

The real-game tests import their engine calls from the Core package, which also defines the plugin context types, and they get the test pack data and record loaders from the content package. Manifest validation relies on the SDK reading schema 2 as an API 1 in-process plugin. The SDK also builds `plugin.js` and checks the result against the source. Its missing manifest import is tracked under SDK builder defect.

Storage keeps the preference JSON as it is now, old direct-options shape included, and the host can read that data at version 0 with no new preference migration. Once the plugin changes API, the storage and key callers have to handle failed results. When a read or write fails, the twin passes the failure on to its caller and doesn't make up a fallback value.

## Verification

The repository's `pnpm verify` command runs typecheck and tests before checking the committed plugin. `plugin.test.ts` drives a real game for auto-dig and its RNG-free declines. It also covers remembered settings on new and loaded characters, pregame policy gating and cloud backup. Light-ignore, input and display tests exercise the enabled and disabled choices. Pixel rendering requires a separate Electron check.

The adapter tests compare metadata, stored JSON and binding decisions from the two adapters. Their flags maps have equal entries in separate objects, and each API 2 failure reason has a test. The live-options test sits in the API 1 adapter group. The boundary scan uses TypeScript syntax nodes to reject runtime engine imports in both adapters and `ctx` identifiers in the twin. Its fixtures test context aliases, destructuring and member-held reads, including assertions, non-null reads, whitespace and bracket access. Import fixtures cover re-exports, dynamic imports and both CommonJS forms. Template expressions and engine-name suffixes also have fixtures.

The changelog's exclusion of internal refactoring and test additions applies to this migration, so its release lists stay unchanged.
