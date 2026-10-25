/** The accessibility activation-shortcut helper, driven by the game's ability notification. */

import type { Api2Panel, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";

export interface AbilityGainedLike {
  readonly kind: "spell" | "activation";
  readonly name: string;
  readonly command: "cast" | "activate";
}

type Keys = Pick<ModApi2["ui"]["keys"], "isBindableTriggerKey" | "bind">;

/** What the wizard needs of the API: key checks and bindings, panels, and a log. */
export interface MacroWizardMod {
  readonly ui: Pick<ModApi2["ui"], "mount" | "unmount" | "patch"> & { readonly keys: Keys };
  readonly meta: Pick<ModApi2["meta"], "log">;
}

const SUGGESTED_TRIGGERS = [
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
];

const PANEL_ID = "activation-shortcut";

/** Prefer an unused function key, which has no ordinary game command to replace. */
export async function suggestedMacroTrigger(keys: Keys): Promise<string | null> {
  for (const trigger of SUGGESTED_TRIGGERS) {
    const answer = await keys.isBindableTriggerKey(trigger);
    if (answer.ok && answer.value) return trigger;
  }
  return null;
}

/** The current host command keys for the two ability families. */
export function macroActionFor(ability: AbilityGainedLike): string {
  return ability.command === "activate" ? "A" : "m";
}

/** Bind only a currently free valid trigger. */
export async function bindAbilityMacro(keys: Keys, ability: AbilityGainedLike, trigger: string): Promise<boolean> {
  const bindable = await keys.isBindableTriggerKey(trigger);
  if (!bindable.ok || !bindable.value) return false;
  return (await keys.bind(trigger, macroActionFor(ability))).ok;
}

/** The helper's card for one ability; `problem` is shown under the key field after a refused bind. */
export function macroPanel(ability: AbilityGainedLike, trigger: string, problem?: string): Api2Panel {
  const family = ability.command === "activate" ? "activation" : "casting";
  return {
    id: PANEL_ID,
    title: `Shortcut for ${ability.name}`,
    modal: true,
    root: {
      type: "column",
      children: [
        { type: "text", text: `Bind a key to open the ${family} command?` },
        { type: "input", label: "Key", action: "set-key", value: trigger },
        ...(problem ? [{ type: "text" as const, text: problem }] : []),
        {
          type: "row",
          children: [
            { type: "button", label: "Bind shortcut", action: "bind" },
            { type: "button", label: "No thanks", action: "decline" },
          ],
        },
      ],
    },
  };
}

const UNAVAILABLE = "That key is unavailable. Choose an unused printable key, Enter, or F1 through F12.";

let mod: MacroWizardMod | null = null;
let active = false;
const pending: AbilityGainedLike[] = [];

/** Hand the wizard the live API once the game exists; hooks are composed before it does. */
export function startMacroWizard(live: MacroWizardMod): void {
  mod = live;
  if (pending.length > 0) void showNext();
}

/** Called by the synchronous game notification. The panel itself owns the later choice. */
export function offerAbilityMacro(ability: AbilityGainedLike): void {
  pending.push(ability);
  if (mod) void showNext();
}

async function showNext(): Promise<void> {
  const live = mod;
  if (active || !live) return;
  const ability = pending.shift();
  if (!ability) return;
  active = true;
  const next = (): void => {
    active = false;
    void showNext();
  };
  const suggested = await suggestedMacroTrigger(live.ui.keys);
  if (!suggested) {
    live.meta.log(`no unused keymap trigger is available for ${ability.name}`);
    next();
    return;
  }
  let key = suggested;
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    void live.ui.unmount(PANEL_ID);
    next();
  };
  const opened = await live.ui.mount(
    macroPanel(ability, key),
    (action, value) => {
      if (action === "set-key" && typeof value === "string") {
        key = value.trim();
      } else if (action === "decline") {
        finish();
      } else if (action === "bind") {
        void bindAbilityMacro(live.ui.keys, ability, key).then((bound) => {
          if (finished) return;
          if (bound) finish();
          else void live.ui.patch(PANEL_ID, { root: macroPanel(ability, key, UNAVAILABLE).root });
        });
      }
    },
    finish,
  );
  if (!opened.ok) {
    live.meta.log(`could not open activation shortcut helper: ${opened.message}`);
    finished = true;
    next();
  }
}

/** Close the active helper and discard deferred offers when this mod stops. */
export function stopMacroWizard(): void {
  const live = mod;
  mod = null;
  pending.splice(0);
  if (active) void live?.ui.unmount(PANEL_ID);
  active = false;
}
