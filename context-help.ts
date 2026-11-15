import type { ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import type { MenuTransformer } from "@rpgm-tools/neo-angband-core";

const MENU_ID = "core:context-object";

const ITEM_HELP: Readonly<Record<string, string>> = {
  inspect: "Read the item's known properties.",
  equip: "Wear or wield this item in a matching slot.",
  takeoff: "Remove this item from its worn slot.",
  drop: "Leave this item on the floor.",
  throw: "Throw this item at a target.",
  fire: "Fire this ammunition with your launcher.",
  inscribe: "Write a note on this item.",
  uninscribe: "Remove this item's note.",
  ignore: "Change whether this item is ignored.",
  browse: "Read the spells in this book.",
  cast: "Choose a spell from this book to cast.",
  study: "Choose a spell from this book to learn.",
  aim: "Use this wand.",
  zap: "Use this rod.",
  "use-staff": "Use this staff.",
  read: "Read this scroll.",
  quaff: "Drink this potion.",
  eat: "Eat this food or mushroom.",
  activate: "Use this item's activation.",
  refill: "Refill your light from this item.",
};

export interface HelpRegistry {
  readonly menus: {
    handlerFor(id: string): MenuTransformer | null;
    register(id: string, transformer: MenuTransformer): void;
  };
}

export function installContextHelp(mod: ModApi2): void {
  const registry = mod.engine?.registry as HelpRegistry | undefined;
  if (!registry) return;
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
