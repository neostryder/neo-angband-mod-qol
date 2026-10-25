/** Optional one-key macros for repeated, non-combat commands. */

import type { Api2Panel, JsonValue, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import { readHideRepeatShortcuts, withHideRepeatShortcuts } from "./preferences";

const PANEL_ID = "repeated-action-shortcuts";

type Keys = Pick<ModApi2["ui"]["keys"], "isBindableTriggerKey" | "bind">;

/** What the card needs of the API: key checks and bindings, panels, stored preferences, and a log. */
export interface RepeatShortcutsMod {
  readonly ui: Pick<ModApi2["ui"], "mount" | "unmount" | "patch"> & { readonly keys: Keys };
  readonly store: { readonly prefs: ModApi2["store"]["prefs"] };
  readonly meta: Pick<ModApi2["meta"], "log">;
}

export interface RepeatShortcut {
  readonly trigger: string;
  readonly label: string;
  readonly action: string;
}

/**
 * Rest is the one command here genuinely worth a bound key: `R` opens a
 * prompt that still has to be answered and submitted, so it costs three
 * keystrokes every single time it is used. A cardinal run is already just
 * `.` plus a direction in the original keyset, and one shifted direction key
 * in roguelike - both are already as short as a bound key would make them,
 * so offering a run shortcut here saved nothing and was dropped (#151).
 *
 * The trailing `[Enter]` is what submits the "rest until healed or
 * disturbed" prompt; without it the sequence would leave the player sitting
 * at an open prompt instead of resting.
 */
export function defaultRepeatShortcuts(): readonly RepeatShortcut[] {
  return [{ trigger: "F1", label: "Rest as needed", action: "R&[Enter]" }];
}

/** Bind one sequence only when the host says its trigger is currently free. */
export async function bindRepeatShortcut(keys: Keys, trigger: string, action: string): Promise<boolean> {
  const bindable = await keys.isBindableTriggerKey(trigger);
  if (!bindable.ok || !bindable.value) return false;
  return (await keys.bind(trigger, action)).ok;
}

/** The card: one row per shortcut, the "don't show again" box, and Done. `status` is the last bind result per shortcut. */
export function repeatShortcutsPanel(
  shortcuts: readonly RepeatShortcut[],
  triggers: readonly string[],
  status: readonly string[],
): Api2Panel {
  return {
    id: PANEL_ID,
    title: "Repeated-action shortcuts",
    modal: false,
    root: {
      type: "column",
      children: [
        { type: "text", text: "Bind one key to a repeated non-combat command. Existing bindings are left unchanged." },
        ...shortcuts.flatMap((shortcut, i) => [
          {
            type: "input" as const,
            label: `${shortcut.label} key`,
            action: `set-key-${String(i)}`,
            value: triggers[i] ?? shortcut.trigger,
          },
          {
            type: "row" as const,
            children: [
              { type: "button" as const, label: "Bind", action: `bind-${String(i)}`, disabled: status[i] === "Bound." },
              { type: "text" as const, text: status[i] ?? "" },
            ],
          },
        ]),
        { type: "checkbox", label: "Don't show this again", action: "hide-forever", checked: false },
        { type: "button", label: "Done", action: "done" },
      ],
    },
  };
}

let live: RepeatShortcutsMod | null = null;

/**
 * Show the setup once per game boot when the accommodation is enabled, unless
 * the player has permanently dismissed it (#198).
 *
 * NON-MODAL, deliberately: this is an optional offer the player can act on or
 * ignore, not a question blocking the way back to the game, so it must not
 * take the whole screen.
 */
export async function startRepeatShortcuts(mod: RepeatShortcutsMod): Promise<void> {
  stopRepeatShortcuts();
  const stored = await mod.store.prefs.get();
  if (stored.ok && readHideRepeatShortcuts(stored.value)) return;
  live = mod;
  const shortcuts = defaultRepeatShortcuts();
  const triggers = shortcuts.map((s) => s.trigger);
  const status = shortcuts.map(() => "");
  const redraw = (): void => {
    void mod.ui.patch(PANEL_ID, { root: repeatShortcutsPanel(shortcuts, triggers, status).root });
  };
  const opened = await mod.ui.mount(
    repeatShortcutsPanel(shortcuts, triggers, status),
    (action, value) => {
      if (action === "done") {
        void mod.ui.unmount(PANEL_ID);
      } else if (action === "hide-forever" && typeof value === "boolean") {
        void mod.store.prefs
          .get()
          .then((current) => mod.store.prefs.set(withHideRepeatShortcuts(current.ok ? current.value : null, value) as unknown as JsonValue));
      } else if (action.startsWith("set-key-") && typeof value === "string") {
        triggers[Number(action.slice("set-key-".length))] = value.trim();
      } else if (action.startsWith("bind-")) {
        const i = Number(action.slice("bind-".length));
        const shortcut = shortcuts[i];
        if (!shortcut) return;
        void bindRepeatShortcut(mod.ui.keys, triggers[i] ?? shortcut.trigger, shortcut.action).then((bound) => {
          status[i] = bound ? "Bound." : "That key is unavailable.";
          redraw();
        });
      }
    },
    () => {
      if (live === mod) live = null;
    },
  );
  if (!opened.ok) {
    mod.meta.log(`could not open repeated-action shortcuts: ${opened.message}`);
    live = null;
  }
}

/** Close the setup card when the mod stops. */
export function stopRepeatShortcuts(): void {
  const mod = live;
  live = null;
  void mod?.ui.unmount(PANEL_ID);
}
