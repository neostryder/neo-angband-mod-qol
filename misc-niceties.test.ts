import { afterEach, describe, expect, it, vi } from "vitest";
import { installMiscNiceties, uninstallMiscNiceties } from "./misc-niceties";
import type { DisplayLike } from "./zoom-pan";

function displayWithStoreNicetiesSetters(): {
  display: DisplayLike;
  setStoreItemNameEllipsis: ReturnType<typeof vi.fn>;
  setStoreSelectionDescription: ReturnType<typeof vi.fn>;
} {
  const setStoreItemNameEllipsis = vi.fn();
  const setStoreSelectionDescription = vi.fn();
  return {
    display: { setStoreItemNameEllipsis, setStoreSelectionDescription } as unknown as DisplayLike,
    setStoreItemNameEllipsis,
    setStoreSelectionDescription,
  };
}

afterEach(() => {
  uninstallMiscNiceties();
});

describe("misc. niceties", () => {
  it("enables both store display niceties through their display seams", () => {
    const fake = displayWithStoreNicetiesSetters();
    installMiscNiceties({ flags: { "qol.miscNiceties": true }, display: fake.display });
    expect(fake.setStoreItemNameEllipsis).toHaveBeenCalledWith(true);
    expect(fake.setStoreSelectionDescription).toHaveBeenCalledWith(true);
  });

  it("does not call either display seam when the bundled toggle is off", () => {
    const fake = displayWithStoreNicetiesSetters();
    installMiscNiceties({ flags: { "qol.miscNiceties": false }, display: fake.display });
    expect(fake.setStoreItemNameEllipsis).not.toHaveBeenCalled();
    expect(fake.setStoreSelectionDescription).not.toHaveBeenCalled();
  });

  it("clears both store display niceties when the mod unloads", () => {
    const fake = displayWithStoreNicetiesSetters();
    installMiscNiceties({ flags: { "qol.miscNiceties": true }, display: fake.display });
    uninstallMiscNiceties();
    expect(fake.setStoreItemNameEllipsis).toHaveBeenLastCalledWith(false);
    expect(fake.setStoreSelectionDescription).toHaveBeenLastCalledWith(false);
  });
});
