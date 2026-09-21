import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installMiscNiceties,
  installQuiverItemization,
  uninstallMiscNiceties,
  uninstallQuiverItemization,
} from "./misc-niceties";
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

function displayWithQuiverItemizationSetter(): {
  display: DisplayLike;
  setQuiverItemization: ReturnType<typeof vi.fn>;
} {
  const setQuiverItemization = vi.fn();
  return {
    display: { setQuiverItemization } as unknown as DisplayLike,
    setQuiverItemization,
  };
}

afterEach(() => {
  uninstallMiscNiceties();
  uninstallQuiverItemization();
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

describe("quiver itemization (#254)", () => {
  it("enables the quiver itemization display seam when its own toggle is on", () => {
    const fake = displayWithQuiverItemizationSetter();
    installQuiverItemization({ flags: { "qol.quiverItemization": true }, display: fake.display });
    expect(fake.setQuiverItemization).toHaveBeenCalledWith(true);
  });

  it("does not call the display seam when the toggle is off", () => {
    const fake = displayWithQuiverItemizationSetter();
    installQuiverItemization({ flags: { "qol.quiverItemization": false }, display: fake.display });
    expect(fake.setQuiverItemization).not.toHaveBeenCalled();
  });

  it("is independent of qol.miscNiceties: only its own flag gates it", () => {
    const fake = displayWithQuiverItemizationSetter();
    installQuiverItemization({
      flags: { "qol.miscNiceties": true, "qol.quiverItemization": false },
      display: fake.display,
    });
    expect(fake.setQuiverItemization).not.toHaveBeenCalled();
  });

  it("clears the quiver itemization display seam when the mod unloads", () => {
    const fake = displayWithQuiverItemizationSetter();
    installQuiverItemization({ flags: { "qol.quiverItemization": true }, display: fake.display });
    uninstallQuiverItemization();
    expect(fake.setQuiverItemization).toHaveBeenLastCalledWith(false);
  });

  it("logs rather than going silently inert when there is no display seam yet", () => {
    const log = vi.fn();
    installQuiverItemization({ flags: { "qol.quiverItemization": true }, log });
    expect(log).toHaveBeenCalledWith("this game is too old to itemize the quiver");
  });
});
