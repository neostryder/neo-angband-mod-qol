/**
 * "First-encounter alerts" (qol.firstEncounterAlerts): a small, dismissible
 * card the first time this character meets a monster race, or picks up an
 * artifact - name, native depth, and (for a monster) a threat badge so an
 * out-of-depth monster or a unique does not go unnoticed on autopilot.
 *
 * WHY A POLL. ModHooks has exactly two per-event notifications an installed
 * mod can receive (abilityGained, optionsChanged) and neither fires when a
 * monster becomes visible or an object is assessed as an artifact - there is
 * no core seam for either, and this repository cannot add one to core from
 * here. core.monsterListCollect (the same collector the "list visible
 * monsters" screen builds from) and the player's own gear are both ordinary
 * read-only public API, so this polls them on a short timer instead of
 * inventing a call site this mod does not own.
 *
 * WHY A CARD, NOT A DIALOG. The activation-shortcut helper's modal panel is
 * right for a question the player must answer before moving on; this is not
 * a question, and freezing input the instant an out-of-depth monster comes
 * into view would defeat the point of a mod raised to make sure a dangerous
 * monster gets NOTICED. A non-modal panel takes no pointer events and never
 * touches the keyboard door (docs/modding/MOD_SEAMS.md section 4b), so the
 * card can sit on screen through a fight without costing a keystroke, and it
 * clears itself on a timer or an explicit click.
 *
 * WHY PER-CHARACTER, IN ctx.prefs. The mod SDK's only durable per-character
 * storage today is migrateBag, read once at load with no live write seam a
 * plugin can reach during play (docs/modding/PLUGINS.md, "Your own saved
 * data"). ctx.prefs is install-wide, but it is the one store this mod can
 * actually write to whenever it likes, so it holds a single character's
 * seen-lists keyed by a fingerprint built from birth-fixed facts (name,
 * race, class, birth stats). A new character has a different fingerprint,
 * which resets the notebook to blank; reloading the same character keeps it,
 * because the fingerprint has not changed. Alternating between two
 * characters shares the one slot and the more recently played one wins -
 * an accepted limit of having no real per-save bag to write into.
 */

import { bitmapTextBlock, paintBitmapButtonLabel, wrapBitmapText } from "./bitmap-text";

/** The shape of a monster race this feature needs, already resolved to plain data. */
export interface MonsterRaceLike {
  readonly ridx: number;
  readonly name: string;
  readonly level: number;
  readonly dChar: string;
  readonly dAttr: number;
  readonly unique: boolean;
}

/** The shape of an artifact this feature needs, already resolved to plain data. */
export interface ArtifactLike {
  readonly aidx: number;
  readonly name: string;
  readonly level: number;
}

/** A carried object, named only for the one field this feature reads. */
export interface GameObjectLike {
  readonly artifact: ArtifactLike | null;
}

/** How dangerous a first-sighted monster looks, relative to the current depth. */
export type ThreatTier = "unique" | "deadly" | "outOfDepth" | "ordinary";

/** How many levels out of depth counts as "deadly" rather than merely "out of depth". */
const DEADLY_OUT_OF_DEPTH_LEVELS = 5;

/** A unique is always notable regardless of depth; otherwise compare native level to here. */
export function classifyMonsterThreat(race: MonsterRaceLike, currentDepth: number): ThreatTier {
  if (race.unique) return "unique";
  const over = race.level - currentDepth;
  if (over >= DEADLY_OUT_OF_DEPTH_LEVELS) return "deadly";
  if (over >= 1) return "outOfDepth";
  return "ordinary";
}

/** Birth-fixed facts that stay the same for a character's whole life. */
export interface BirthFingerprint {
  readonly fullName: string;
  readonly raceName: string;
  readonly clsName: string;
  readonly auBirth: number;
  readonly htBirth: number;
  readonly wtBirth: number;
}

/** A stable key for one character, built only from facts that never change after birth. */
export function characterKey(fingerprint: BirthFingerprint): string {
  return [
    fingerprint.fullName,
    fingerprint.raceName,
    fingerprint.clsName,
    fingerprint.auBirth,
    fingerprint.htBirth,
    fingerprint.wtBirth,
  ].join("|");
}

/** The one JSON value kept in ctx.prefs for this feature. */
export interface FirstEncounterPrefs {
  readonly v: 1;
  readonly characterKey: string;
  readonly monsters: readonly number[];
  readonly artifacts: readonly number[];
}

export interface FirstEncounterNotebook {
  readonly monsters: Set<number>;
  readonly artifacts: Set<number>;
}

/** An empty notebook when nothing is stored, or the stored one belongs to a different character. */
export function readFirstEncounterPrefs(raw: unknown, key: string): FirstEncounterNotebook {
  if (raw && typeof raw === "object") {
    const stored = raw as Partial<FirstEncounterPrefs>;
    if (stored.v === 1 && stored.characterKey === key) {
      return {
        monsters: new Set(
          Array.isArray(stored.monsters) ? stored.monsters.filter((n) => typeof n === "number") : [],
        ),
        artifacts: new Set(
          Array.isArray(stored.artifacts) ? stored.artifacts.filter((n) => typeof n === "number") : [],
        ),
      };
    }
  }
  return { monsters: new Set(), artifacts: new Set() };
}

export function toFirstEncounterPrefs(
  key: string,
  notebook: FirstEncounterNotebook,
): FirstEncounterPrefs {
  return {
    v: 1,
    characterKey: key,
    monsters: [...notebook.monsters],
    artifacts: [...notebook.artifacts],
  };
}

/** Races present now that are not yet in the notebook, one entry per race even if several stand on the level. */
export function newMonsterSightings(
  visible: readonly MonsterRaceLike[],
  alreadySeen: ReadonlySet<number>,
): MonsterRaceLike[] {
  const found: MonsterRaceLike[] = [];
  const claimed = new Set<number>();
  for (const race of visible) {
    if (alreadySeen.has(race.ridx) || claimed.has(race.ridx)) continue;
    claimed.add(race.ridx);
    found.push(race);
  }
  return found;
}

/** Assessed artifacts carried now that are not yet in the notebook. */
export function newArtifactFinds(
  carried: readonly ArtifactLike[],
  alreadySeen: ReadonlySet<number>,
): ArtifactLike[] {
  const found: ArtifactLike[] = [];
  const claimed = new Set<number>();
  for (const artifact of carried) {
    if (alreadySeen.has(artifact.aidx) || claimed.has(artifact.aidx)) continue;
    claimed.add(artifact.aidx);
    found.push(artifact);
  }
  return found;
}

/** Every assessed, known artifact currently in the player's gear (pack and worn alike). */
export function carriedKnownArtifacts(
  gear: Iterable<GameObjectLike>,
  liveObjectIsKnownArtifact: (obj: GameObjectLike) => boolean,
): ArtifactLike[] {
  const found: ArtifactLike[] = [];
  for (const obj of gear) {
    if (obj.artifact && liveObjectIsKnownArtifact(obj)) found.push(obj.artifact);
  }
  return found;
}

/** What the card shows, independent of how it is drawn. */
export interface EncounterCardContent {
  readonly kind: "monster" | "artifact";
  readonly title: string;
  readonly name: string;
  readonly depthText: string;
  readonly tier?: ThreatTier;
  readonly glyphChar?: string;
  readonly glyphColor?: string;
}

const TIER_LABEL: Readonly<Record<ThreatTier, string>> = {
  unique: "Unique!",
  deadly: "Deadly - well out of depth",
  outOfDepth: "Out of depth",
  ordinary: "First sighting",
};

/** The colour a tier's title and border are painted in, independent of the monster's own glyph colour. */
export const TIER_COLOR: Readonly<Record<ThreatTier, string>> = {
  unique: "#e8c34a",
  deadly: "#e05a4e",
  outOfDepth: "#e0954e",
  ordinary: "#7fd88f",
};

export function monsterCardContent(
  race: MonsterRaceLike,
  currentDepth: number,
  fmtDepth: (depth: number) => string,
  colorToCss: (attr: number) => string,
): EncounterCardContent {
  const tier = classifyMonsterThreat(race, currentDepth);
  return {
    kind: "monster",
    title: TIER_LABEL[tier],
    name: race.name,
    depthText: fmtDepth(race.level),
    tier,
    glyphChar: race.dChar,
    glyphColor: colorToCss(race.dAttr),
  };
}

export function artifactCardContent(
  artifact: ArtifactLike,
  fmtDepth: (depth: number) => string,
): EncounterCardContent {
  return {
    kind: "artifact",
    title: "Artifact found!",
    name: artifact.name,
    depthText: fmtDepth(artifact.level),
  };
}

/* ------------------------------------------------------------------ */
/* Live wiring: the poll, the notebook, and the non-modal card itself. */
/* ------------------------------------------------------------------ */

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

interface CoreLike {
  monsterListCollect(state: unknown): { entries: readonly { race: MonsterRaceLike }[] };
  liveObjectIsKnownArtifact(obj: GameObjectLike): boolean;
  fmtDepth(depth: number): string;
  colorToCss(attr: number): string;
}

interface PlayerLike {
  readonly fullName: string;
  readonly race: { readonly name: string };
  readonly cls: { readonly name: string };
  readonly auBirth: number;
  readonly htBirth: number;
  readonly wtBirth: number;
}

interface StateLike {
  readonly chunk: { readonly depth: number };
  readonly gear: { readonly store: ReadonlyMap<number, GameObjectLike> };
  /* The player lives at state.actor.player (GameState.actor: PlayerActor,
   * PlayerActor.player: Player), not state.player directly - matching
   * zoom-pan.ts's own state.actor access elsewhere in this mod. */
  readonly actor: { readonly player: PlayerLike };
}

export interface FirstEncounterContext {
  readonly core: CoreLike;
  readonly state: StateLike;
  readonly ui?: UiLike;
  readonly prefs?: PrefsLike;
  readonly log?: (message: string) => void;
}

/** How often to look for something newly visible or newly carried. */
const POLL_MS = 750;
/** How long a card stays up before it clears itself. */
const AUTO_DISMISS_MS = 9000;

let timer: ReturnType<typeof setInterval> | null = null;
let queue: EncounterCardContent[] = [];
let activePanel: PanelLike | null = null;
let activeTimeout: ReturnType<typeof setTimeout> | null = null;

function showNext(ui: UiLike): void {
  if (activePanel) return;
  const content = queue.shift();
  if (!content) return;

  let panel: PanelLike;
  try {
    panel = ui.openPanel({ id: "first-encounter", modal: false, label: content.title });
  } catch {
    /* A refused or throwing panel loses this one card; the poll finds the same
     * race or artifact again next tick only if it is removed from the
     * notebook, which it is not, so this simply skips one notification. */
    return;
  }
  activePanel = panel;
  drawCard(panel, content);

  const advance = (): void => {
    activePanel = null;
    showNext(ui);
  };
  void panel.closed.then(advance);

  activeTimeout = setTimeout(() => {
    activeTimeout = null;
    panel.close();
  }, AUTO_DISMISS_MS);
}

function drawCard(panel: PanelLike, content: EncounterCardContent): void {
  const root = panel.root;
  const style = document.createElement("style");
  const accent = content.tier ? TIER_COLOR[content.tier] : TIER_COLOR.ordinary;
  /* No `font`/`font-size` rules here any more: every piece of this card's own
   * text is now a bitmap-blitted canvas (see bitmap-text.ts), matching the
   * font the game itself draws with instead of a system one (#197, #199). */
  style.textContent =
    ":host { all: initial; }" +
    ".wrap { position: fixed; inset: auto 1rem 1rem auto; display: flex; justify-content: flex-end; pointer-events: none; }" +
    ".card { position: relative; pointer-events: auto; width: 19rem; max-width: calc(100vw - 2rem); background: #17140f; color: #f2ead8; border-radius: 10px; padding: .8rem 1rem; box-shadow: 0 6px 22px rgba(0,0,0,.45); border: 2px solid " +
    accent +
    "; animation: qol-first-encounter-in .3s ease-out; }" +
    "@keyframes qol-first-encounter-in { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }" +
    ".head { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; }" +
    ".glyph { flex: none; width: 2.1rem; height: 2.1rem; display: flex; align-items: center; justify-content: center; background: #000; border-radius: 6px; }" +
    ".depth { margin-top: .3rem; }" +
    ".close { position: absolute; top: .3rem; right: .45rem; pointer-events: auto; background: none; border: none; opacity: .55; padding: .2rem; }" +
    ".close:hover { opacity: 1; }";

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("role", "status");

  const dpr = window.devicePixelRatio || 1;
  const cellHeight = 16;
  const cellWidth = cellHeight * (16 / 24);
  const titleCellHeight = 12;
  const titleCellWidth = titleCellHeight * (16 / 24);
  const nameCellHeight = 20;
  const nameCellWidth = nameCellHeight * (16 / 24);
  /* Card width (19rem, 16px root) less its own left/right padding and the
   * glyph badge's own column, divided by one glyph cell - a rough estimate
   * good enough for wrapping this card's own short strings. */
  const maxChars = Math.max(10, Math.floor((19 * 16 - 32 - 34) / nameCellWidth));

  const close = document.createElement("button");
  close.className = "close";
  close.type = "button";
  close.addEventListener("click", () => panel.close());
  paintBitmapButtonLabel(close, "X", "#f2ead8", cellWidth, cellHeight, dpr);
  close.setAttribute("aria-label", "Dismiss");

  const head = document.createElement("div");
  head.className = "head";
  if (content.glyphChar) {
    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.appendChild(
      bitmapTextBlock(
        [[{ text: content.glyphChar, css: content.glyphColor ?? "#f2ead8" }]],
        24,
        24,
        dpr,
      ),
    );
    head.append(glyph);
  }
  const titleBlock = document.createElement("div");
  const title = bitmapTextBlock(
    [[{ text: content.title.toUpperCase(), css: accent }]],
    titleCellWidth,
    titleCellHeight,
    dpr,
  );
  const name = bitmapTextBlock(
    wrapBitmapText(content.name, maxChars).map((line) => [{ text: line, css: "#f2ead8" }]),
    nameCellWidth,
    nameCellHeight,
    dpr,
  );
  name.style.marginTop = ".15rem";
  titleBlock.append(title, name);
  head.append(titleBlock);

  const depth = document.createElement("div");
  depth.className = "depth";
  depth.appendChild(
    bitmapTextBlock(
      [[{ text: `Native depth: ${content.depthText}`, css: "#c8c0ac" }]],
      cellWidth,
      cellHeight,
      dpr,
    ),
  );

  card.append(close, head, depth);
  wrap.append(card);
  root.append(style, wrap);
}

function characterKeyFor(player: PlayerLike): string {
  return characterKey({
    fullName: player.fullName,
    raceName: player.race.name,
    clsName: player.cls.name,
    auBirth: player.auBirth,
    htBirth: player.htBirth,
    wtBirth: player.wtBirth,
  });
}

/** Start polling for newly-visible monster races and newly-carried artifacts. */
export function installFirstEncounter(ctx: FirstEncounterContext): void {
  if (
    !ctx.ui ||
    typeof ctx.core.monsterListCollect !== "function" ||
    typeof ctx.core.liveObjectIsKnownArtifact !== "function" ||
    typeof ctx.core.fmtDepth !== "function" ||
    typeof ctx.core.colorToCss !== "function"
  ) {
    ctx.log?.("this game is too old for first-encounter alerts");
    return;
  }
  const ui = ctx.ui;
  const core = ctx.core;
  const key = characterKeyFor(ctx.state.actor.player);
  const notebook = readFirstEncounterPrefs(ctx.prefs?.get(), key);
  const save = (): void => ctx.prefs?.set(toFirstEncounterPrefs(key, notebook));

  timer = setInterval(() => {
    let visible: readonly MonsterRaceLike[];
    try {
      visible = core.monsterListCollect(ctx.state).entries.map((entry) => entry.race);
    } catch (error) {
      ctx.log?.(`first-encounter alerts: could not read visible monsters: ${String(error)}`);
      return;
    }
    const newMonsters = newMonsterSightings(visible, notebook.monsters);

    let carried: ArtifactLike[];
    try {
      carried = carriedKnownArtifacts(ctx.state.gear.store.values(), core.liveObjectIsKnownArtifact);
    } catch (error) {
      ctx.log?.(`first-encounter alerts: could not read carried gear: ${String(error)}`);
      return;
    }
    const newArtifacts = newArtifactFinds(carried, notebook.artifacts);

    if (newMonsters.length === 0 && newArtifacts.length === 0) return;

    for (const race of newMonsters) notebook.monsters.add(race.ridx);
    for (const artifact of newArtifacts) notebook.artifacts.add(artifact.aidx);
    save();

    const depth = ctx.state.chunk.depth;
    for (const race of newMonsters) {
      queue.push(monsterCardContent(race, depth, core.fmtDepth, core.colorToCss));
    }
    for (const artifact of newArtifacts) {
      queue.push(artifactCardContent(artifact, core.fmtDepth));
    }
    showNext(ui);
  }, POLL_MS);
}

/** Stop polling and clear any card this feature still owns. */
export function uninstallFirstEncounter(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  if (activeTimeout !== null) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }
  activePanel?.close();
  activePanel = null;
  queue = [];
}
