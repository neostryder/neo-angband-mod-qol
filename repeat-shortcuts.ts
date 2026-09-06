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

/** Show the consented setup once per game boot when the accommodation is enabled. */
export function installRepeatShortcuts(ctx: RepeatShortcutsContext): void {
  if (!ctx.ui || !ctx.keymaps) {
    ctx.log?.("this game is too old for repeated-action shortcuts");
    return;
  }
  let panel: PanelLike;
  try {
    panel = ctx.ui.openPanel({
      id: "repeated-action-shortcuts",
      modal: true,
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
  style.textContent = ":host { font: 16px sans-serif; } main { background: #151515; color: #f5f5f5; border: 2px solid #d4b05b; border-radius: 8px; max-width: 38rem; margin: 12vh auto; padding: 1.25rem; } label { display: block; margin-top: .7rem; } input { width: 5rem; } button { margin: .5rem .5rem 0 0; }";
  const main = document.createElement("main");
  const title = document.createElement("h2");
  title.textContent = "Repeated-action shortcuts";
  const words = document.createElement("p");
  words.textContent = "Bind one key to a repeated non-combat command. Existing bindings are left unchanged.";
  main.append(title, words);

  for (const shortcut of shortcuts) {
    const label = document.createElement("label");
    label.textContent = `${shortcut.label}: `;
    const input = document.createElement("input");
    input.value = shortcut.trigger;
    input.maxLength = 5;
    input.setAttribute("aria-label", `${shortcut.label} shortcut key`);
    const bind = document.createElement("button");
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
    main.append(label);
  }

  const done = document.createElement("button");
  done.textContent = "Done";
  done.addEventListener("click", () => panel.close());
  main.append(done);
  root.append(style, main);
}
