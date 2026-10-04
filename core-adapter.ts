/**
 * The only module in this mod that reads the game's internals.
 *
 * The host hands a plugin a context: the engine namespace, the live game, the
 * mod's stored preferences, key bindings, panels and the display. This file is
 * the only one that reads it. Each entry point in plugin.ts calls createAdapter
 * with the context it was given and hands the result on, and the other modules
 * see only the plain functions and structural types they are passed.
 *
 * The groups follow the mod API 2 domains. An entry in `meta`, `store` or `ui`
 * keeps the name and arguments of its API 2 counterpart but stays synchronous;
 * in API 2 each of those calls is async and returns an Api2Result. `engine` and
 * `host` hold what API 2 does not hand a mod, and each entry there says what it
 * is used for and what API 2 would need to replace it.
 *
 * Imports from @rpgm-tools/neo-angband-core are type-only, so the built
 * plugin.js imports nothing.
 */

import type { CaveCmdDeps, ModHooks } from "@rpgm-tools/neo-angband-core";
import { lightIgnoreToggles, lightIgnoreWrap, type LightObjectLike } from "./light-ignore";
import type { DisplayLike } from "./misc-niceties";

/**
 * The engine, as a type. `typeof import(...)` is type-only syntax, so this pulls
 * in no runtime dependency and the built plugin.js contains no import at all.
 */
type CoreApi = typeof import("@rpgm-tools/neo-angband-core");

/**
 * `PrefErrorPolicy` (core, visuals/prefs.ts), structurally.
 *
 * Two axes rather than one number, because one number could not say both
 * things: whether the REST of a pref file is applied after a bad line, and how
 * many errors the player is told about.
 */
export interface PrefErrorPolicyLike {
  continueAfterError: boolean;
  reportLimit: number;
}

/**
 * The engine, plus the one seam this mod needs that an older engine may not
 * have.
 *
 * `setPrefErrorPolicy` arrived with the engine that removed core's own error cap
 * (#272). Declared OPTIONAL for exactly the reason `ctx.prefs` is: manifest.json's
 * `engine` range is the gate, and this is the seatbelt for the day the two
 * disagree. On an engine that has it, `CoreApi` already declares it and this
 * intersection changes nothing.
 */
type CoreWithPrefPolicy = CoreApi & {
  readonly setPrefErrorPolicy?: (policy: PrefErrorPolicyLike | null) => void;
};

/**
 * The part of core's OptionState this mod uses, structurally - same reason as
 * PluginContext: the mod names what it touches instead of importing a host type.
 */
export interface OptionStateLike {
  get(name: string): boolean;
  set(name: string, value: boolean): boolean;
  isBirth(name: string): boolean;
  isCheat(name: string): boolean;
  isScore(name: string): boolean;
  hitpointWarn: number;
  delayFactor: number;
  lazymoveDelay: number;
}

/**
 * What this plugin needs from the host's context, structurally.
 *
 * Declared here rather than imported from src/mod-plugin.ts on purpose: this file
 * has to compile in a standalone mod repository that has no copy of the host. A
 * structural subset also states exactly what the mod touches, which is the honest
 * form of "the mod uses no private path".
 */
export interface PluginContext {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly core: CoreWithPrefPolicy;
  /**
   * This mod's own storage, kept OUTSIDE the character's save - the host's
   * `ctx.prefs`. Optional here because a host older than the one that added it
   * hands over nothing, and a mod that assumed otherwise would throw at boot on
   * a game the manifest's `engine` range should simply have refused. Belt and
   * braces: the range is the gate, this is the seatbelt.
   */
  readonly prefs?: {
    get(): unknown;
    set(value: unknown): void;
  };
  /**
   * A player-chosen folder for automatic save backups. It is absent when the
   * host cannot offer a folder picker or the capability was not granted.
   *
   * `list()` (neo-angband#24) is the read side: every `.neochar` file
   * currently in the chosen folder, identified cheaply (name, lineage,
   * character name and level - never a full decode). Optional on this type
   * only because an older host hands over the rest of `backupFolder` without
   * it; called through `?.` for exactly that reason.
   */
  readonly backupFolder?: {
    choose(): Promise<string | null>;
    write(name: string, text: string): Promise<boolean>;
    onSave(fn: (file: { readonly name: string; readonly text: string }) => void): void;
    list?(): Promise<
      readonly {
        readonly name: string;
        readonly lineage?: string;
        readonly characterName: string;
        readonly level: number;
      }[]
    >;
  };
  /** Live web display geometry, absent during content composition or on old hosts. */
  readonly display?: (DisplayLike & { onKey(listener: (event: KeyboardEvent) => void): () => void }) | undefined;
  /** Whether this character was created this session rather than loaded. */
  readonly newCharacter?: boolean;
  /** The live game, when there is one. Absent during content composition. */
  readonly state?: {
    options?: OptionStateLike;
    /**
     * The one seam every ignore-aware read in core already goes through
     * (game/context.ts's own doc comment on GameState.isIgnored: "so
     * worldless code stays decoupled from flavor knowledge"), rather than a
     * private path this mod invented. installLightIgnore wraps it to add two
     * independent torch/lantern auto-ignore toggles (#267) without touching
     * state.ignore's own quality/kind/ego settings at all - not readonly,
     * because that wrap is the whole mechanism.
     */
    isIgnored?(obj: LightObjectLike): boolean;
  };
  /** Emit a diagnostic line; the host decides where it goes. */
  readonly log?: (msg: string) => void;
  readonly keymaps?: {
    isBindableTriggerKey(trigger: string): boolean;
    bind(trigger: string, action: string): boolean;
  };
  /**
   * The host's live judgement on the most recent root-screen keydown - a
   * genuine key-repeat (a held key auto-repeating) versus a fresh,
   * deliberate press (neo-angband#35). Absent on a host older than the one
   * that added it. Only `isRepeat` is named here, structurally: it is the
   * only field purge-queued-input.ts reads.
   */
  readonly keyRepeat?: () => { readonly isRepeat: boolean } | null;
  readonly ui?: {
    openPanel(spec: { id: string; modal: boolean; label: string }): {
      readonly root: ShadowRoot;
      readonly closed: Promise<void>;
      close(): void;
    };
  };
}

/** The registry-host subset this mod uses for its Game-menu action. */
export interface MenuHost {
  readonly menus: {
    addAction(
      id: "core:game-menu",
      action: string,
      label: string,
      handler: () => void | Promise<void>,
    ): void;
  };
}

type WalkBlockedByDiggable = NonNullable<ModHooks["walkBlockedByDiggable"]>;
/** The live game walkBlockedByDiggable hands its hook. */
export type WalkState = Parameters<WalkBlockedByDiggable>[0];
/** The grid the player walked into. */
export type WalkGrid = Parameters<WalkBlockedByDiggable>[1];

/**
 * The one field of the live game installLightIgnore reads and replaces.
 *
 * Method-shorthand syntax on purpose, matching PluginContext's convention for
 * every structural host callback: TypeScript checks a method signature's
 * parameter bivariantly, so a real host state (whose isIgnored takes the full
 * GameObject) can be assigned into this narrower structural slot. A property
 * typed as an arrow-function LITERAL is checked contravariantly instead and
 * would refuse that assignment outright, since LightObjectLike is not
 * assignable to the real, much wider GameObject.
 */
export interface LightIgnoreGameLike {
  isIgnored?(obj: LightObjectLike): boolean;
}

export interface LightIgnoreContext {
  readonly flags: Readonly<Record<string, boolean>>;
  /** Only TV.LIGHT is read; structural rather than the whole TV table. */
  readonly core: { readonly TV: { readonly LIGHT: number } };
  /** The live game, absent during content composition (mirrors PluginContext.state). */
  readonly state?: LightIgnoreGameLike | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

/** The previously-installed wrap, so a second install (a reload, or a test
 * re-registering) can cleanly restore what it replaced before deciding whether
 * to wrap again - the same reset-then-maybe-install shape misc-niceties.ts uses
 * for its own display seam. */
let installedLightIgnore: {
  readonly state: LightIgnoreGameLike;
  readonly original: LightIgnoreGameLike["isIgnored"];
} | null = null;

/**
 * Install (or reinstall) the torch/lantern auto-ignore wrap for the current
 * game. Safe to call every register(), including across a reload: it always
 * un-wraps its own previous installation first, then re-wraps only if the live
 * game is present and at least one of the two toggles is on. With both off, this
 * is a total no-op - state.isIgnored is left exactly as it already was, which is
 * the regression guard for every other ignore choice the player has made.
 * light-ignore.ts decides what the wrap answers.
 */
export function installLightIgnore(ctx: LightIgnoreContext): void {
  uninstallLightIgnore();

  const toggles = lightIgnoreToggles(ctx.flags);
  if (!toggles) return;

  const state = ctx.state;
  if (!state) {
    ctx.log?.("ignore torches/lanterns: no live game at register time");
    return;
  }

  const lightTval = ctx.core.TV?.LIGHT;
  if (typeof lightTval !== "number") {
    ctx.log?.("ignore torches/lanterns: this game is too old to report TV.LIGHT");
    return;
  }

  const original = state.isIgnored;
  state.isIgnored = lightIgnoreWrap(toggles, lightTval, original);
  installedLightIgnore = { state, original };
}

/** Restore whatever state.isIgnored was before installLightIgnore wrapped it. */
export function uninstallLightIgnore(): void {
  if (!installedLightIgnore) return;
  const { state, original } = installedLightIgnore;
  installedLightIgnore = null;
  /* exactOptionalPropertyTypes: assigning `undefined` to an optional property
   * is a type error distinct from the property being ABSENT, so an absent
   * original is restored by deleting the wrap rather than writing it. */
  if (original) {
    state.isIgnored = original;
  } else {
    delete state.isIgnored;
  }
}

/** The mod's stored preferences: one JSON value, kept apart from any character. */
export type PrefsSlot = NonNullable<PluginContext["prefs"]>;
/** The player's key bindings, as the mod may change them. */
export type KeyBindings = NonNullable<PluginContext["keymaps"]>;
/** The host's DOM panel opener. */
export type PanelHost = NonNullable<PluginContext["ui"]>;

/** Everything the rest of the mod reads from the host, grouped by API 2 domain. */
export interface QolAdapter {
  readonly meta: {
    /** API 2: meta.flags. */
    readonly flags: Readonly<Record<string, boolean>>;
    /** API 2: meta.newCharacter. */
    readonly newCharacter: boolean;
    /** API 2: meta.log. A host without a log drops the line. */
    log(message: string): void;
  };
  readonly store: {
    /** API 2: store.prefs, with get() and set(value). Absent on a host too old to keep it. */
    readonly prefs: PrefsSlot | undefined;
  };
  readonly ui: {
    /** API 2: ui.keys. bind matches; API 2 answers a taken trigger with refused instead of isBindableTriggerKey. */
    readonly keys: KeyBindings | undefined;
    /** API 2: ui.mount and ui.patch, which draw the panel grammar; this one hands over a DOM shadow root. */
    readonly panels: PanelHost | undefined;
  };
  /** Engine reads and writes with no API 2 counterpart. */
  readonly engine: {
    /** core.movementTunnelTest: whether walking into the grid digs (auto-dig). API 2: a host-interpreted declaration or policy table, since this hook decides a move synchronously. */
    movementTunnelTest(state: WalkState, grid: WalkGrid): boolean;
    /** core.tunnelAux: one real tunnel attempt with its roll and payouts (auto-dig). API 2: the same host-interpreted declaration or policy table; the host would run the dig. */
    tunnelAux(state: WalkState, grid: WalkGrid, deps: unknown): void;
    /** state.z.moveEnergy: the energy a move costs, which auto-dig spends. API 2: the same host-interpreted declaration or policy table. */
    moveEnergy(state: WalkState): number;
    /** core.setPrefErrorPolicy: keep reading a pref file past a bad line. Absent on an older engine. API 2: a host-interpreted policy declaration, since it applies before any game exists. */
    readonly setPrefErrorPolicy: ((policy: PrefErrorPolicyLike | null) => void) | undefined;
    /** new core.OptionState(): a throwaway option table that classifies birth, cheat and score options. API 2: a content record lookup or view field listing each option's category. */
    newOptionState(): OptionStateLike;
    /** ctx.state.options: the new character's live option store, written once at boot. API 2: a view field for the options and a host-interpreted declaration of a new character's starting options. */
    readonly liveOptions: OptionStateLike | undefined;
    /** core.TV.LIGHT and ctx.state.isIgnored: wraps the live ignore check to hide torches or lanterns. API 2: a host-interpreted ignore declaration or policy table, since isIgnored is a synchronous engine callback. */
    installLightIgnore(): void;
  };
  /** Host seams with no API 2 form: they reach the host's own drawing, input or files. */
  readonly host: {
    /** ctx.display: misc. niceties' display switches and purge queued input's raw key listener. API 2: a host-interpreted declaration of the display switches and a key event. */
    readonly display: PluginContext["display"];
    /** ctx.keyRepeat: whether the last keydown was an auto-repeat (purge queued input). API 2: a view field on the input wait or a key event payload. */
    readonly keyRepeat: PluginContext["keyRepeat"];
    /** ctx.backupFolder: the cloud-backup folder picker and save mirror. API 2: not there yet; needs a host-interpreted declaration. */
    readonly backupFolder: PluginContext["backupFolder"];
    /** Registry host menus.addAction on core:game-menu. API 2: a host-interpreted menu declaration. */
    addGameMenuAction(action: string, label: string, handler: () => void | Promise<void>): void;
  };
}

/**
 * Build the adapter over one plugin context. `menuHost` is the registry host
 * register() receives; hooks() has none, and there addGameMenuAction does
 * nothing.
 */
export function createAdapter(ctx: PluginContext, menuHost: MenuHost | null = null): QolAdapter {
  const core = ctx.core;
  return {
    meta: {
      flags: ctx.flags,
      get newCharacter() {
        return ctx.newCharacter === true;
      },
      log: (message) => ctx.log?.(message),
    },
    store: {
      get prefs() {
        return ctx.prefs;
      },
    },
    ui: {
      get keys() {
        return ctx.keymaps;
      },
      get panels() {
        return ctx.ui;
      },
    },
    engine: {
      movementTunnelTest: (state, grid) => core.movementTunnelTest(state, grid),
      tunnelAux: (state, grid, deps) => {
        /* deps is the live CaveCmdDeps the session built; core types it as unknown
         * so ModHooks does not drag the cave-command types into every consumer. */
        core.tunnelAux(state, grid, deps as CaveCmdDeps);
      },
      moveEnergy: (state) => state.z.moveEnergy,
      get setPrefErrorPolicy() {
        return core.setPrefErrorPolicy;
      },
      newOptionState: () => new core.OptionState(),
      get liveOptions() {
        return ctx.state?.options;
      },
      installLightIgnore: () =>
        installLightIgnore({
          flags: ctx.flags,
          core,
          ...(ctx.state ? { state: ctx.state } : {}),
          ...(ctx.log ? { log: ctx.log } : {}),
        }),
    },
    host: {
      get display() {
        return ctx.display;
      },
      get keyRepeat() {
        return ctx.keyRepeat;
      },
      get backupFolder() {
        return ctx.backupFolder;
      },
      addGameMenuAction: (action, label, handler) =>
        menuHost?.menus.addAction("core:game-menu", action, label, handler),
    },
  };
}
