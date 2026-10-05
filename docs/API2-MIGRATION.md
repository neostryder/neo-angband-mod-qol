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
| API 2 home, still unwired | 13 |
| Core request | 26 |

The plugin has no controller or presentation members (`hud`, `menu`, `screen`, `birth`, `frontend`, `regions`). It reads no registry, raw snapshot or game-event subscription. Its menu dependency is the registry action in the table. The `ctx` variables in `bitmap-text.ts` refer to canvases.

## Core requests

### CR1: loading and retained engine access

The folder loader can call the existing in-process shim after checking an API 2 definition and its range. The builder needs to accept the same definition. For P-tier mods, an allowlist gates a versioned engine domain such as `engine: { api, core, state?, registries? }`. Its members are documented aliases of the current namespace, live state and registry host. Composition also needs this context before startup so the retained live hooks can run. Loading applies to every tier. The engine aliases and live hooks stay P-tier only.

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

`ui.keys.isBindableTriggerKey(trigger)` can return a boolean result under `keymap:write`. It must check the same keyset and trigger validity as the API 1 call without changing ownership. This read supplies the wizard's suggested key, the repeat-card candidate and the purge-key check. The subsequent bind still checks for a collision. The grant can cover this read in every tier.

### CR9: purge input policy

The purge can use `{ kind: "purge-input", trigger: "F2", modifiers: [], freshOnly: true, escapeCount: 3 }`. The host reserves F2 only when it is unused and treats its own repeat classification as the fresh-press test. It consumes repeat presses and sends three cancellations through ordinary Escape handling for each fresh press. No macro takes ownership of the key. A key-event implementation instead needs `{ key, code, modifiers, isRepeat }`, delivery before default handling, unsubscribe support and an action for those cancellations. Prompt answers alone do not close all menus. The policy can run in any granted tier, with raw interception limited to P-tier engine access.

### CR10: panels with editable controls and dismissal

The panel grammar needs a text-input node for trigger editing and a checkbox node for the repeat card's permanent dismissal. Both controls send value-change actions. A button needs a disabled field, and a panel needs modal placement. `ui.unmount(panelId)` and a dismissal notification release the mounted id and finish the wizard offer when a panel closes. The cards can then use the host's font while keeping their current choices and dismissal behavior. The panel grant covers these operations in every tier. Until then, the twin has no `panels` member.

### CR11: cloud backup folder

A backup-folder domain can wrap the existing `choose`, `write` and `list` calls in API 2 results. Its save subscription supplies the name and text to mirror, with an unsubscribe handle for teardown. The picker returns a display name or null, and the listing retains its current character metadata. The domain keeps the `backup:folder` permission without exposing a real filesystem path. That permission is available outside P-tier.

### CR12: a Game-menu action

The backup picker can register through `{ menu: "core:game-menu", action: "choose-backup-folder", label }` with a callback for selection. The host adds the row when the mod starts and removes it when the mod stops. The existing `registry:menu` grant remains until the declaration has a replacement grant. A declaration can serve any granted tier, while the mutable registry-host fallback remains P-tier only.

### CR13: builder manifest id

The SDK builder's `readManifestId` calls `manifestFields` without importing it. Its catch block hides that error and selects the folder basename instead, so a build in this worktree writes `overhaul-api2` into the banner. Core can fix this by importing its own manifest reader in the builder. The bug affects both manifest schemas and makes the committed output depend on the checkout folder's name. This build-tool fix has no tier restriction.

## Removal list

`plugin.ts` no longer receives `engine.liveOptions`. It calls the category predicates and setters in `engine.startingOptions`, keeping the live OptionState inside the adapter. The temporary classifier returned by `engine.newOptionState` exposes only its category predicates. Core still performs the same option writes.

The four grants stay because the current entry still uses them. Backup waits for CR11, the menu row for CR12, key availability and purge for CR8-CR9, and panels for CR10. The existing key bindings keep `keymap:write` as well. The Core package supplies types and real-game tests, content supplies their pack data, and the SDK supplies manifest validation and the builder. The remaining reads and writes depend on the Core requests in their table rows.

Storage keeps the current preference JSON, including the old direct-options shape. The host can read that data at version 0 without a new preference migration. When the plugin changes API, storage and key callers must handle failed results. The twin forwards a failed read or write to its caller without inventing a fallback value.

## Verification

The repository's `pnpm verify` command runs typecheck and tests before checking the committed plugin. `plugin.test.ts` drives a real game for auto-dig and its RNG-free declines. It also covers remembered settings on new and loaded characters, pregame policy gating and cloud backup. Light-ignore, input and display tests exercise the enabled and disabled choices. Pixel rendering requires a separate Electron check.

`core-adapter-api2.test.ts` compares metadata and stored JSON from both adapters and tests their binding decisions on the same keys. It also exercises all API 2 failure reasons. The boundary test parses TypeScript syntax rather than stripping text. Its source checks reject runtime engine imports in either adapter and any `ctx` identifier in the twin. The regression cases cover non-null and asserted context reads, whitespace, bracket access, re-exports, dynamic imports, template expressions and engine-name suffixes.

The changelog's exclusion of internal refactoring and test additions applies to this migration, so its release lists stay unchanged.
