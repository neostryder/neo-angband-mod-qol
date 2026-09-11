/** The accessibility activation-shortcut helper, driven by core's ability event. */

import { bitmapTextBlock, paintBitmapButtonLabel, wrapBitmapText } from "./bitmap-text";

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
  /* No `font`/`font-size` rules here any more: every piece of this card's
   * own text is now a bitmap-blitted canvas (see bitmap-text.ts), matching
   * the font the game itself draws with instead of a system one (#197,
   * #199). The trigger-key `<input>` is the one exception - a player has to
   * be able to type into it, which a canvas cannot do - so it alone keeps a
   * real CSS font, close in size to the surrounding bitmap text. */
  style.textContent =
    "main { background: #151515; color: #f5f5f5; border: 2px solid #d4b05b; border-radius: 8px; max-width: 34rem; margin: 12vh auto; padding: 1.25rem; }" +
    "input { width: 5rem; font: 16px monospace; }" +
    "label { display: flex; align-items: center; gap: .4rem; }" +
    "button { margin: .5rem .5rem 0 0; background: none; border: 1px solid #686878; border-radius: 4px; cursor: pointer; padding: .25rem .5rem; }";
  const main = document.createElement("main");

  const dpr = window.devicePixelRatio || 1;
  const cellHeight = 16;
  const cellWidth = cellHeight * (16 / 24);
  const titleCellHeight = 20;
  const titleCellWidth = titleCellHeight * (16 / 24);
  /* 34rem (16px root) less main's own left/right padding, divided by one
   * glyph cell - a rough estimate good enough for wrapping this dialog's
   * own short sentences. */
  const maxChars = Math.max(10, Math.floor((34 * 16 - 40) / cellWidth));

  const title = bitmapTextBlock(
    wrapBitmapText(`Shortcut for ${ability.name}`, maxChars).map((line) => [
      { text: line, css: "#f5f5f5" },
    ]),
    titleCellWidth,
    titleCellHeight,
    dpr,
  );
  const words = bitmapTextBlock(
    wrapBitmapText(
      `Bind ${suggested} to open the ${ability.command === "activate" ? "activation" : "casting"} command?`,
      maxChars,
    ).map((line) => [{ text: line, css: "#f5f5f5" }]),
    cellWidth,
    cellHeight,
    dpr,
  );
  words.style.marginTop = ".5rem";
  const label = document.createElement("label");
  label.style.marginTop = ".5rem";
  label.appendChild(bitmapTextBlock([[{ text: "Key:", css: "#f5f5f5" }]], cellWidth, cellHeight, dpr));
  const input = document.createElement("input");
  input.value = suggested;
  input.maxLength = 5;
  input.setAttribute("aria-label", "Shortcut key");
  label.appendChild(input);
  const accept = document.createElement("button");
  paintBitmapButtonLabel(accept, "Bind shortcut", "#f5f5f5", cellWidth, cellHeight, dpr);
  const decline = document.createElement("button");
  paintBitmapButtonLabel(decline, "No thanks", "#f5f5f5", cellWidth, cellHeight, dpr);
  let result = bitmapTextBlock([[{ text: "", css: "#e07a6e" }]], cellWidth, cellHeight, dpr);
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
    const next = bitmapTextBlock(
      wrapBitmapText(
        "That key is unavailable. Choose an unused printable key, Enter, or F1 through F12.",
        maxChars,
      ).map((line) => [{ text: line, css: "#e07a6e" }]),
      cellWidth,
      cellHeight,
      dpr,
    );
    result.replaceWith(next);
    result = next;
  });
  decline.addEventListener("click", finish);
  root.append(style, main);
  main.append(title, words, label, document.createElement("br"), accept, decline, result);
}
