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
