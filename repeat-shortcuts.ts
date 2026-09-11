/** Optional one-key macros for repeated, non-combat commands. */

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

export interface RepeatShortcut {
  readonly trigger: string;
  readonly label: string;
  readonly action: string;
}

export interface RepeatShortcutsContext {
  readonly ui?: UiLike;
  readonly keymaps?: KeymapsLike;
  readonly roguelike: boolean;
  readonly log?: (message: string) => void;
}

/**
 * Rest needs a command key and a choice in either keyset. Original-keyset runs
 * need a command key and a direction; roguelike already runs with one shifted
 * direction key, so offering duplicate run bindings there would save nothing.
 *
 * Rest carries a trailing Enter because `R` opens a prompt that has to be
 * submitted, while a direction prompt resolves on the digit itself, so the run
 * sequences end at their direction.
 */
export function defaultRepeatShortcuts(roguelike: boolean): readonly RepeatShortcut[] {
  const shortcuts: RepeatShortcut[] = [
    { trigger: "F1", label: "Rest as needed", action: "R&[Enter]" },
  ];
  if (!roguelike) {
    shortcuts.push(
      { trigger: "F2", label: "Run north", action: ".8" },
      { trigger: "F3", label: "Run south", action: ".2" },
      { trigger: "F4", label: "Run west", action: ".4" },
      { trigger: "F5", label: "Run east", action: ".6" },
    );
  }
  return shortcuts;
}

/** Bind one sequence only when the host says its trigger is currently free. */
export function bindRepeatShortcut(keymaps: KeymapsLike, trigger: string, action: string): boolean {
  return keymaps.isBindableTriggerKey(trigger) && keymaps.bind(trigger, action);
}

/**
 * Show the consented setup once per game boot when the accommodation is enabled.
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
  drawPrompt(panel, ctx.keymaps, defaultRepeatShortcuts(ctx.roguelike));
}

function drawPrompt(
  panel: PanelLike,
  keymaps: KeymapsLike,
  shortcuts: readonly RepeatShortcut[],
): void {
  const root = panel.root;
  const style = document.createElement("style");
  /* `.wrap` takes no pointer events and tucks into a corner, same shape as
   * first-encounter.ts's card; `.card` opts back in so its own controls are
   * still clickable. Small and out of the way rather than centered over the
   * screen - see installRepeatShortcuts's comment for why. */
  style.textContent =
    ":host { all: initial; }" +
    ".wrap { position: fixed; inset: auto 1rem 1rem auto; display: flex; justify-content: flex-end; pointer-events: none; font: 14px/1.4 system-ui, sans-serif; }" +
    ".card { position: relative; pointer-events: auto; width: 22rem; max-width: calc(100vw - 2rem); max-height: calc(100vh - 2rem); overflow-y: auto; background: #151515; color: #f5f5f5; border-radius: 10px; padding: .9rem 1rem; box-shadow: 0 6px 22px rgba(0,0,0,.45); border: 2px solid #d4b05b; box-sizing: border-box; }" +
    "h2 { margin: 0; font-size: 1rem; }" +
    "p { margin: .5rem 0 0; opacity: .85; }" +
    "label { display: block; margin-top: .7rem; }" +
    "input { width: 4.5rem; }" +
    "button { margin: .5rem .5rem 0 0; }" +
    ".close { position: absolute; top: .4rem; right: .5rem; background: none; border: none; color: #f5f5f5; font-size: 1rem; line-height: 1; cursor: pointer; opacity: .55; padding: .2rem; }" +
    ".close:hover { opacity: 1; }";

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("role", "group");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.textContent = "X";
  close.setAttribute("aria-label", "Dismiss");
  close.addEventListener("click", () => panel.close());

  const title = document.createElement("h2");
  title.textContent = "Repeated-action shortcuts";
  const words = document.createElement("p");
  words.textContent = "Bind one key to a repeated non-combat command. Existing bindings are left unchanged.";
  card.append(close, title, words);

  for (const shortcut of shortcuts) {
    const label = document.createElement("label");
    label.textContent = `${shortcut.label}: `;
    const input = document.createElement("input");
    input.value = shortcut.trigger;
    input.maxLength = 5;
    input.setAttribute("aria-label", `${shortcut.label} shortcut key`);
    const bind = document.createElement("button");
    bind.type = "button";
    bind.textContent = "Bind";
    const result = document.createElement("span");
    bind.addEventListener("click", () => {
      const trigger = input.value.trim();
      if (bindRepeatShortcut(keymaps, trigger, shortcut.action)) {
        result.textContent = " Bound.";
        bind.disabled = true;
        return;
      }
      result.textContent = " That key is unavailable.";
    });
    label.append(input, bind, result);
    card.append(label);
  }

  const done = document.createElement("button");
  done.type = "button";
  done.textContent = "Done";
  done.addEventListener("click", () => panel.close());
  card.append(done);

  wrap.append(card);
  root.append(style, wrap);
}
