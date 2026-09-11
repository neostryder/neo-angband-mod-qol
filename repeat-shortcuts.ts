/** Optional one-key macros for repeated, non-combat commands. */

import { readHideRepeatShortcuts, withHideRepeatShortcuts } from "./preferences";
import { bitmapTextBlock, paintBitmapButtonLabel, wrapBitmapText } from "./bitmap-text";

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

interface PrefsLike {
  get(): unknown;
  set(value: unknown): void;
}

export interface RepeatShortcut {
  readonly trigger: string;
  readonly label: string;
  readonly action: string;
}

export interface RepeatShortcutsContext {
  readonly ui?: UiLike;
  readonly keymaps?: KeymapsLike;
  /** Where "don't show this again" is remembered (#198). Offered every boot,
   * same as before, when the host is too old to carry one. */
  readonly prefs?: PrefsLike;
  readonly log?: (message: string) => void;
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
export function bindRepeatShortcut(keymaps: KeymapsLike, trigger: string, action: string): boolean {
  return keymaps.isBindableTriggerKey(trigger) && keymaps.bind(trigger, action);
}

/**
 * Show the consented setup once per game boot when the accommodation is
 * enabled, unless the player has permanently dismissed it (#198).
 *
 * NON-MODAL, deliberately, on the same grounds first-encounter.ts's card
 * gives for its own non-modal choice: this is an optional offer the player
 * can act on or ignore, not a question blocking the way back to the game, so
 * it must not take the whole screen. It also has to draw its own dismiss
 * control - a non-modal panel gets none from the host - which the "Done"
 * button and the corner close button below both are.
 */
export function installRepeatShortcuts(ctx: RepeatShortcutsContext): void {
  if (!ctx.ui || !ctx.keymaps) {
    ctx.log?.("this game is too old for repeated-action shortcuts");
    return;
  }
  if (readHideRepeatShortcuts(ctx.prefs?.get())) return;
  let panel: PanelLike;
  try {
    panel = ctx.ui.openPanel({
      id: "repeated-action-shortcuts",
      modal: false,
      label: "Repeated-action shortcuts",
    });
  } catch (error) {
    ctx.log?.(`could not open repeated-action shortcuts: ${String(error)}`);
    return;
  }
  drawPrompt(panel, ctx.keymaps, defaultRepeatShortcuts(), ctx.prefs);
}

function drawPrompt(
  panel: PanelLike,
  keymaps: KeymapsLike,
  shortcuts: readonly RepeatShortcut[],
  prefs?: PrefsLike,
): void {
  const root = panel.root;
  const style = document.createElement("style");
  /* `.wrap` takes no pointer events and tucks into a corner, same shape as
   * first-encounter.ts's card; `.card` opts back in so its own controls are
   * still clickable. Small and out of the way rather than centered over the
   * screen - see installRepeatShortcuts's comment for why.
   *
   * No `font`/`font-size` rules here any more: every piece of this card's own
   * text is now a bitmap-blitted canvas (see bitmap-text.ts), matching the
   * font the game itself draws with instead of a system one (#197, #199).
   * The one exception is the trigger-key `<input>` - a player has to be able
   * to type into it, which a canvas cannot do - so it alone keeps a real CSS
   * font, close in size to the surrounding bitmap text. */
  style.textContent =
    ":host { all: initial; }" +
    ".wrap { position: fixed; inset: auto 1rem 1rem auto; display: flex; justify-content: flex-end; pointer-events: none; }" +
    ".card { position: relative; pointer-events: auto; width: 22rem; max-width: calc(100vw - 2rem); max-height: calc(100vh - 2rem); overflow-y: auto; background: #151515; color: #f5f5f5; border-radius: 10px; padding: .9rem 1rem; box-shadow: 0 6px 22px rgba(0,0,0,.45); border: 2px solid #d4b05b; box-sizing: border-box; }" +
    ".row { display: flex; align-items: center; gap: .4rem; margin-top: .7rem; }" +
    "input[type=text] { width: 4.5rem; font: 14px monospace; }" +
    "button { margin: .5rem .5rem 0 0; background: none; border: 1px solid #686878; border-radius: 4px; cursor: pointer; padding: .2rem .4rem; }" +
    ".close { position: absolute; top: .4rem; right: .5rem; border: none; opacity: .55; padding: .2rem; }" +
    ".close:hover { opacity: 1; }" +
    ".forever { display: flex; align-items: center; gap: .4rem; margin-top: .7rem; }";

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("role", "group");

  /* Rough estimate of the card's usable width in bitmap-font columns: 22rem
   * (16px root) less its own left/right padding, divided by one glyph cell.
   * Good enough for wrapping a settings card's own prose - it does not need
   * to survive a page zoom the way the responsive sidebar does. */
  const dpr = window.devicePixelRatio || 1;
  const cellHeight = 18;
  const cellWidth = cellHeight * (16 / 24);
  const maxChars = Math.max(10, Math.floor((22 * 16 - 32) / cellWidth));
  const titleCellHeight = 20;
  const titleCellWidth = titleCellHeight * (16 / 24);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.addEventListener("click", () => panel.close());
  paintBitmapButtonLabel(close, "X", "#f5f5f5", cellWidth, cellHeight, dpr);
  close.setAttribute("aria-label", "Dismiss");

  const title = bitmapTextBlock(
    [[{ text: "Repeated-action shortcuts", css: "#f5f5f5" }]],
    titleCellWidth,
    titleCellHeight,
    dpr,
  );
  const words = bitmapTextBlock(
    wrapBitmapText(
      "Bind one key to a repeated non-combat command. Existing bindings are left unchanged.",
      maxChars,
    ).map((line) => [{ text: line, css: "#c8c8c8" }]),
    cellWidth,
    cellHeight,
    dpr,
  );
  words.style.marginTop = ".5rem";
  card.append(close, title, words);

  for (const shortcut of shortcuts) {
    const row = document.createElement("div");
    row.className = "row";
    const label = bitmapTextBlock(
      [[{ text: `${shortcut.label}:`, css: "#f5f5f5" }]],
      cellWidth,
      cellHeight,
      dpr,
    );
    const input = document.createElement("input");
    input.type = "text";
    input.value = shortcut.trigger;
    input.maxLength = 5;
    input.setAttribute("aria-label", `${shortcut.label} shortcut key`);
    const bind = document.createElement("button");
    bind.type = "button";
    paintBitmapButtonLabel(bind, "Bind", "#f5f5f5", cellWidth, cellHeight, dpr);
    const result = bitmapTextBlock([[{ text: "", css: "#f5f5f5" }]], cellWidth, cellHeight, dpr);
    bind.addEventListener("click", () => {
      const trigger = input.value.trim();
      const bound = bindRepeatShortcut(keymaps, trigger, shortcut.action);
      const text = bound ? "Bound." : "That key is unavailable.";
      result.replaceWith(bitmapTextBlock([[{ text, css: "#f5f5f5" }]], cellWidth, cellHeight, dpr));
      if (bound) bind.disabled = true;
    });
    row.append(label, input, bind, result);
    card.append(row);
  }

  if (prefs) {
    const forever = document.createElement("label");
    forever.className = "forever";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", "Don't show this again");
    checkbox.addEventListener("change", () => {
      prefs.set(withHideRepeatShortcuts(prefs.get(), checkbox.checked));
    });
    const foreverLabel = bitmapTextBlock(
      [[{ text: "Don't show this again", css: "#f5f5f5" }]],
      cellWidth,
      cellHeight,
      dpr,
    );
    forever.append(checkbox, foreverLabel);
    card.append(forever);
  }

  const done = document.createElement("button");
  done.type = "button";
  done.addEventListener("click", () => panel.close());
  paintBitmapButtonLabel(done, "Done", "#f5f5f5", cellWidth, cellHeight, dpr);
  card.append(done);

  wrap.append(card);
  root.append(style, wrap);
}
