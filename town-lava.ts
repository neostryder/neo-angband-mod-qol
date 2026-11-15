/*
 * town_gen_layout (gen-cave.c) fills the town with granite before it draws
 * lava streamers. A streamer that the starburst does not carve back into
 * floor is the lava this pass turns into granite again. The stair-adjacent
 * case in that function already uses granite. levelGenerated is not given
 * an RNG, and a false return would make cave_generate roll the level again.
 */

export interface TownGrid {
  readonly x: number;
  readonly y: number;
}

export interface TownCave {
  readonly depth: number;
  readonly height: number;
  readonly width: number;
  feat(grid: TownGrid): number;
  setFeat(grid: TownGrid, feat: number): void;
}

export interface TownLevel {
  readonly c: TownCave;
}

export interface TownCore {
  readonly FEAT: { readonly LAVA: number; readonly GRANITE: number };
  loc(x: number, y: number): TownGrid;
}

export function clearTownLava(gen: TownLevel, core: TownCore): boolean {
  const cave = gen.c;
  if (cave.depth !== 0) return true;
  const lava = core.FEAT.LAVA;
  const granite = core.FEAT.GRANITE;
  for (let y = 0; y < cave.height; y++) {
    for (let x = 0; x < cave.width; x++) {
      const grid = core.loc(x, y);
      if (cave.feat(grid) === lava) cave.setFeat(grid, granite);
    }
  }
  return true;
}
