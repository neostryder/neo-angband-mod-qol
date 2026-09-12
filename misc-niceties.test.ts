import { afterEach, describe, expect, it, vi } from "vitest";
import { installMiscNiceties, uninstallMiscNiceties } from "./misc-niceties";
import type { DisplayLike } from "./zoom-pan";

function displayWithEllipsisSetter(): {
  display: DisplayLike;
  setStoreItemNameEllipsis: ReturnType<typeof vi.fn>;
} {
  const setStoreItemNameEllipsis = vi.fn();
  return {
    display: { setStoreItemNameEllipsis } as unknown as DisplayLike,
    setStoreItemNameEllipsis,
  };
}

afterEach(() => {
  uninstallMiscNiceties();
});

describe("misc. niceties", () => {
  it("enables the store item-name ellipsis through the display seam", () => {
    const fake = displayWithEllipsisSetter();
    installMiscNiceties({ flags: { "qol.miscNiceties": true }, display: fake.display });
    expect(fake.setStoreItemNameEllipsis).toHaveBeenCalledWith(true);
  });

  it("does not call the display seam when the bundled toggle is off", () => {
    const fake = displayWithEllipsisSetter();
    installMiscNiceties({ flags: { "qol.miscNiceties": false }, display: fake.display });
    expect(fake.setStoreItemNameEllipsis).not.toHaveBeenCalled();
  });

  it("clears the store item-name ellipsis when the mod unloads", () => {
    const fake = displayWithEllipsisSetter();
    installMiscNiceties({ flags: { "qol.miscNiceties": true }, display: fake.display });
    uninstallMiscNiceties();
    expect(fake.setStoreItemNameEllipsis).toHaveBeenLastCalledWith(false);
  });
});
