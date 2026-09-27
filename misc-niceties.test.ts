import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installMiscNiceties,
  uninstallMiscNiceties,
} from "./misc-niceties";
import type { DisplayLike } from "./misc-niceties";

function displayWithStoreNicetiesSetters(): {
  display: DisplayLike;
  setStoreItemNameEllipsis: ReturnType<typeof vi.fn>;
  setStoreSelectionDescription: ReturnType<typeof vi.fn>;
  setMonsterListColorKey: ReturnType<typeof vi.fn>;
} {
  const setStoreItemNameEllipsis = vi.fn();
  const setStoreSelectionDescription = vi.fn();
  const setMonsterListColorKey = vi.fn();
  return {
    display: {
      setStoreItemNameEllipsis,
      setStoreSelectionDescription,
      setMonsterListColorKey,
    } as unknown as DisplayLike,
    setStoreItemNameEllipsis,
    setStoreSelectionDescription,
    setMonsterListColorKey,
  };
}

afterEach(() => {
  uninstallMiscNiceties();
});

describe("misc. niceties", () => {
  it("enables all three bundled display niceties through their display seams", () => {
    const fake = displayWithStoreNicetiesSetters();
    installMiscNiceties({ flags: { "qol.miscNiceties": true }, display: fake.display });
    expect(fake.setStoreItemNameEllipsis).toHaveBeenCalledWith(true);
    expect(fake.setStoreSelectionDescription).toHaveBeenCalledWith(true);
    expect(fake.setMonsterListColorKey).toHaveBeenCalledWith(true);
  });

  it("does not call any bundled display seam when the toggle is off", () => {
    const fake = displayWithStoreNicetiesSetters();
    installMiscNiceties({ flags: { "qol.miscNiceties": false }, display: fake.display });
    expect(fake.setStoreItemNameEllipsis).not.toHaveBeenCalled();
    expect(fake.setStoreSelectionDescription).not.toHaveBeenCalled();
    expect(fake.setMonsterListColorKey).not.toHaveBeenCalled();
  });

  it("clears all three bundled display niceties when the mod unloads", () => {
    const fake = displayWithStoreNicetiesSetters();
    installMiscNiceties({ flags: { "qol.miscNiceties": true }, display: fake.display });
    uninstallMiscNiceties();
    expect(fake.setStoreItemNameEllipsis).toHaveBeenLastCalledWith(false);
    expect(fake.setStoreSelectionDescription).toHaveBeenLastCalledWith(false);
    expect(fake.setMonsterListColorKey).toHaveBeenLastCalledWith(false);
  });

  it("flips the monster list colour key to off and back on across two installs", () => {
    const fake = displayWithStoreNicetiesSetters();
    installMiscNiceties({ flags: { "qol.miscNiceties": true }, display: fake.display });
    uninstallMiscNiceties();
    installMiscNiceties({ flags: { "qol.miscNiceties": true }, display: fake.display });
    expect(fake.setMonsterListColorKey.mock.calls).toEqual([[true], [false], [true]]);
  });
});
