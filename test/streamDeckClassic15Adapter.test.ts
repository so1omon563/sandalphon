import { describe, expect, it, vi } from "vitest";

vi.mock("@elgato/streamdeck", () => ({
  default: { profiles: { switchToProfile: vi.fn() } },
  DeviceType: { StreamDeck: 0 },
}));

import type { Classic15MvpSurface } from "../src/classic15Mvp.js";
import { StreamDeckClassic15Adapter } from "../src/streamDeckClassic15Adapter.js";

describe("StreamDeckClassic15Adapter", () => {
  it("clears imported profile titles before rendering managed key images", async () => {
    const surface = {
      frame: {
        revision: 0,
        view: "unavailable",
        keys: Array.from({ length: 15 }, (_, index) => ({
          index,
          label: "Loading",
          enabled: false,
          state: "unavailable",
        })),
      },
      onFrame: vi.fn(() => () => undefined),
      onExit: vi.fn(() => () => undefined),
      invalidatePhysicalInput: vi.fn(),
    } as unknown as Classic15MvpSurface;
    const setImage = vi.fn().mockResolvedValue(undefined);
    const setTitle = vi.fn().mockResolvedValue(undefined);
    const adapter = new StreamDeckClassic15Adapter(surface);

    adapter.registerKey({
      id: "key-0",
      coordinates: { column: 0, row: 0 },
      device: {
        id: "classic-device",
        size: { columns: 5, rows: 3 },
        type: 0,
      },
      setImage,
      setTitle,
      showAlert: vi.fn().mockResolvedValue(undefined),
    } as never);

    await vi.waitFor(() => expect(setImage).toHaveBeenCalledOnce());
    expect(setTitle).toHaveBeenCalledWith("");
  });
});
