# Wave 3 API gaps

The following gaps were checked against the a7a10a4cc local pack and Core source on 2026-11-15. No partial feature or private-state workaround ships for these rows.

| ID | What fails | Smallest Core addition | Priority | Status and evidence |
| --- | --- | --- | --- | --- |
| QOL-4 (#392) | The birth editor cannot display option category marks or an explanation supplied by the mod. The final confirmation cannot list every nondefault birth choice within 160 characters. | A birth-option row hint and marks returned as data, plus a structured confirmation list of changed options and their effective defaults that the host lays out before accepting one key. | degrade | Open. `packages/core/src/mod/hooks.ts:319` returns void from `birthOptionHighlight`. `packages/web/src/options.ts:365` calls it before painting rows itself and reads no return value. `packages/web/src/birth.ts:1614` cuts `birthConfirmNote` to 160 characters. Confirmation facts contain values without defaults. The highlight default comes from `OPTION_ENTRIES.normal`, while `packages/core/src/player/options.ts:64` overrides `birth_no_selling` to false. |

The #392 issue and comments do not propose a marking set. The owner still needs to choose the difficulty, item-generation, and score categories.
