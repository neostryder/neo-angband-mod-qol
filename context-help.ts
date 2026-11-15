import type { ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import type { MenuTransformer } from "@rpgm-tools/neo-angband-core";

const MENU_ID = "core:context-object";

const ITEM_HELP: Readonly<Record<string, string>> = {
  inspect: "Show what you have learned about this item so far.",
  equip: "Wear or wield it in the matching equipment slot.",
  takeoff: "Stop wearing or wielding this item.",
  drop: "Leave it on the floor where you stand.",
  throw: "Throw it at a target you pick.",
  fire: "Shoot this ammunition from your sling, bow, or crossbow.",
  inscribe: "Add an inscription that shows next to its name.",
  uninscribe: "Remove this item's inscription.",
  ignore: "Mark it ignored so it stays hidden, or unmark it.",
  browse: "List the spells in this book without casting any.",
  cast: "Pick a spell from this book and cast it.",
  study: "Learn a new spell from this book.",
  aim: "Point the wand in a direction and use a charge.",
  zap: "Zap the rod. It recharges over time.",
  "use-staff": "Use the staff, spending one of its charges.",
  read: "Read the scroll, using it up.",
  quaff: "Drink the potion.",
  eat: "Eat this food or mushroom.",
  activate: "Use the item's activation. It needs time to recharge.",
  refill: "Refuel your light source from this item.",
};

const COMMAND_HELP: Readonly<Record<string, string>> = {
  "{": ITEM_HELP.inscribe!, "}": ITEM_HELP.uninscribe!, w: ITEM_HELP.equip!, t: ITEM_HELP.takeoff!,
  I: ITEM_HELP.inspect!, d: ITEM_HELP.drop!, f: ITEM_HELP.fire!, u: ITEM_HELP["use-staff"]!,
  a: ITEM_HELP.aim!, z: ITEM_HELP.zap!, A: ITEM_HELP.activate!, E: ITEM_HELP.eat!,
  q: ITEM_HELP.quaff!, r: ITEM_HELP.read!, F: ITEM_HELP.refill!, v: ITEM_HELP.throw!,
  b: ITEM_HELP.browse!, G: ITEM_HELP.study!, m: ITEM_HELP.cast!, k: ITEM_HELP.ignore!,
  U: "Choose an item and use its ordinary action.",
  D: "Choose a direction to disarm a trap or chest.",
  R: "Rest for a turn count or until you recover.",
  l: "Look at a grid, monster, or item without spending a turn.",
  "*": "Choose a monster or location as your target.",
  "'": "Target the nearest visible monster.",
  T: "Choose a direction to dig through terrain.",
  "<": "Climb the up staircase under you.",
  ">": "Descend the down staircase under you.",
  o: "Choose a direction to open a door or chest.",
  c: "Choose a direction to close a door.",
  h: "Fire ammunition at the nearest target.",
  W: "Step in a direction without automatically disarming a trap.",
  e: "List your worn equipment.", i: "List the items in your pack.", "|": "List ammunition in your quiver.",
  g: "Pick up an item from the floor under you.",
  S: "Show your character's abilities.", M: "Show the map of this level.",
  K: "Show or hide items marked as ignored.", "]": "List the items you can see.", "[": "List the monsters you can see.",
  L: "Move the map view to look around the level.", "/": "Explain a map symbol.",
  C: "Show your character's stats, equipment, and history.", "~": "Browse what your character has learned.",
  "=": "Review interface options and character settings.", Q: "End this character's run by retiring.",
  ")": "Save a text or HTML copy of the screen.", ":": "Add a note to your character's history.",
  V: "Show the game version.", '"': "Apply one preference-file line.",
  "+": "Alter the adjacent grid in a direction you choose.", s: "Attempt to steal from an adjacent monster.",
  ";": "Walk one step in a direction you choose.", ".": "Run in a direction until something stops you.",
  ",": "Wait in place for one turn.", p: "Explore until interrupted or no unexplored route remains.",
  n: "Repeat the previous command.",
};

const COMMAND_MENUS = ["items", "action-commands", "manage-items", "information", "utility", "hidden"];

export interface HelpRegistry {
  readonly menus: {
    handlerFor(id: string): MenuTransformer | null;
    register(id: string, transformer: MenuTransformer): void;
  };
}

export function installContextHelp(mod: ModApi2): void {
  const registry = mod.engine?.registry as HelpRegistry | undefined;
  if (!registry) return;
  const commandHints = new Map<string, string>();
  const tableId = "core:keypress-command-table";
  const previousTable = registry.menus.handlerFor(tableId);
  registry.menus.register(tableId, (id, rows) => {
    const current = previousTable ? previousTable(id, rows) : rows;
    commandHints.clear();
    for (const row of current) {
      const key = row.semantic.data?.originalKey;
      if (row.semantic.kind !== "keypress-command" || typeof key !== "string") continue;
      const hint = Object.hasOwn(COMMAND_HELP, key) ? COMMAND_HELP[key] : undefined;
      if (hint !== undefined) commandHints.set(row.id, hint);
    }
    return current;
  });
  // The browser references table row ids, so help follows either keyset without label matching.
  for (const menu of COMMAND_MENUS) {
    const menuId = "core:keypress-command:" + menu;
    const previous = registry.menus.handlerFor(menuId);
    registry.menus.register(menuId, (id, rows) => {
      const current = previous ? previous(id, rows) : rows;
      return current.map((row) => {
        const ref = row.semantic.ref;
        const hint = row.semantic.kind === "keypress-command" && typeof ref === "string" ? commandHints.get(ref) : undefined;
        return row.hint !== undefined || hint === undefined ? row : { ...row, hint };
      });
    });
  }
  const previous = registry.menus.handlerFor(MENU_ID);
  registry.menus.register(MENU_ID, (id, rows) => {
    const current = previous ? previous(id, rows) : rows;
    return current.map((row) => {
      const ref = row.semantic.ref;
      if (row.hint !== undefined || row.semantic.kind !== "command" || typeof ref !== "string") return row;
      // The menu's semantic action is public; item properties are not needed for help.
      const hint = Object.hasOwn(ITEM_HELP, ref) ? ITEM_HELP[ref] : undefined;
      return hint === undefined ? row : { ...row, hint };
    });
  });
}
