/** The accessibility activation-shortcut helper, driven by core's ability event. */

export interface AbilityGainedLike {
  readonly kind: "spell" | "activation";
  readonly name: string;
  readonly command: "cast" | "activate";
}

interface KeymapsLike {
  isBindableTriggerKey(trigger: string): boolean;
  bind(trigger: string, action: string): boolean;
}

interface PanelLike {
  readonly root: ShadowRoot;
  readonly closed: Promise<void>;
  close(): void;
}

interface UiLike {
  openPanel(spec: { id: string; modal: boolean; label: string }): PanelLike;
}

export interface MacroWizardContext {
  readonly ui?: UiLike;
  readonly keymaps?: KeymapsLike;
  readonly log?: (message: string) => void;
}

const SUGGESTED_TRIGGERS = [
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
];

/** Prefer an unused function key, which has no ordinary game command to replace. */
export function suggestedMacroTrigger(keymaps: KeymapsLike): string | null {
  return SUGGESTED_TRIGGERS.find((trigger) => keymaps.isBindableTriggerKey(trigger)) ?? null;
}

/** The current host command keys for the two ability families. */
export function macroActionFor(ability: AbilityGainedLike): string {
  return ability.command === "activate" ? "A" : "m";
}

/** Bind only a currently free valid trigger. Kept pure enough for the mod tests. */
export function bindAbilityMacro(
  keymaps: KeymapsLike,
  ability: AbilityGainedLike,
  trigger: string,
): boolean {
  if (!keymaps.isBindableTriggerKey(trigger)) return false;
  return keymaps.bind(trigger, macroActionFor(ability));
}

let runtime: MacroWizardContext | null = null;
let active = false;
const pending: AbilityGainedLike[] = [];

/** Install the live context after the game exists; hooks are composed before it does. */
export function installMacroWizard(ctx: MacroWizardContext): void {
  runtime = ctx.ui && ctx.keymaps ? ctx : null;
  if (!runtime) ctx.log?.("this game is too old for the activation shortcut helper");
}

/** Called by the synchronous core notification. The modal itself owns the later choice. */
export function offerAbilityMacro(ability: AbilityGainedLike): void {
  if (!runtime) return;
  pending.push(ability);
  showNext();
}

function showNext(): void {
  if (active || !runtime) return;
  const ability = pending.shift();
  if (!ability) return;
  const suggested = suggestedMacroTrigger(runtime.keymaps!);
  if (!suggested) {
    runtime.log?.(`no unused keymap trigger is available for ${ability.name}`);
    showNext();
    return;
  }
  active = true;
  let panel: PanelLike;
  try {
    panel = runtime.ui!.openPanel({
      id: "activation-shortcut",
      modal: true,
      label: "Activation shortcut helper",
    });
  } catch (error) {
    runtime.log?.(`could not open activation shortcut helper: ${String(error)}`);
    active = false;
    showNext();
    return;
  }
  drawPrompt(panel, ability, suggested, (): void => {
    active = false;
    showNext();
  });
}

function drawPrompt(
  panel: PanelLike,
  ability: AbilityGainedLike,
  suggested: string,
  done: () => void,
): void {
  const root = panel.root;
  const style = document.createElement("style");
  style.textContent = ":host { font: 16px sans-serif; } main { background: #151515; color: #f5f5f5; border: 2px solid #d4b05b; border-radius: 8px; max-width: 34rem; margin: 12vh auto; padding: 1.25rem; } input { width: 5rem; } button { margin: .5rem .5rem 0 0; }";
  const main = document.createElement("main");
  const title = document.createElement("h2");
  title.textContent = `Shortcut for ${ability.name}`;
  const words = document.createElement("p");
  words.textContent = `Bind ${suggested} to open the ${ability.command === "activate" ? "activation" : "casting"} command?`;
  const label = document.createElement("label");
  label.textContent = "Key: ";
  const input = document.createElement("input");
  input.value = suggested;
  input.maxLength = 5;
  input.setAttribute("aria-label", "Shortcut key");
  label.appendChild(input);
  const accept = document.createElement("button");
  accept.textContent = "Bind shortcut";
  const decline = document.createElement("button");
  decline.textContent = "No thanks";
  const result = document.createElement("p");
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    panel.close();
    done();
  };
  void panel.closed.then(() => {
    if (!finished) {
      finished = true;
      done();
    }
  });
  accept.addEventListener("click", () => {
    const trigger = input.value.trim();
    if (runtime?.keymaps && bindAbilityMacro(runtime.keymaps, ability, trigger)) {
      finish();
      return;
    }
    result.textContent = "That key is unavailable. Choose an unused printable key, Enter, or F1 through F12.";
  });
  decline.addEventListener("click", finish);
  root.append(style, main);
  main.append(title, words, label, document.createElement("br"), accept, decline, result);
}
