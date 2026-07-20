import { describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";

vi.mock("@elgato/streamdeck", () => ({
  default: { profiles: { switchToProfile: vi.fn() } },
  DeviceType: { StreamDeckPlus: 7 },
}));

import type { PlusMvpSurface } from "../src/plusMvp.js";
import { StreamDeckPlusAdapter } from "../src/streamDeckPlusAdapter.js";
import streamDeck from "@elgato/streamdeck";

describe("StreamDeckPlusAdapter", () => {
  it("becomes ready with the complete managed Plus surface", async () => {
    const surface = {
      frame: {
        revision: 1,
        view: "home",
        keys: Array.from({ length: 8 }, (_, index) => ({
          index,
          label: "Ready",
          enabled: true,
          state: "idle",
          icon: "state",
        })),
        encoders: Array.from({ length: 4 }, (_, index) => ({
          index,
          title: index === 0 ? "Sessions" : "",
          detail: index === 0 ? "Ready" : "",
          state: "idle",
          rotate: "",
          press: "",
          touch: "",
        })),
      },
      onFrame: vi.fn(() => () => undefined),
      onExit: vi.fn(() => () => undefined),
      invalidatePhysicalInput: vi.fn(),
    } as unknown as PlusMvpSurface;
    const images = Array.from({ length: 8 }, () => vi.fn());
    const adapter = new StreamDeckPlusAdapter(surface);

    for (let index = 0; index < 8; index += 1) {
      adapter.registerKey({
        id: `key-${index}`,
        coordinates: { column: index % 4, row: Math.floor(index / 4) },
        device: {
          id: "plus-device",
          size: { columns: 4, rows: 2 },
          type: 7,
        },
        setImage: images[index],
        showAlert: vi.fn().mockResolvedValue(undefined),
      } as never);
    }
    for (let index = 0; index < 4; index += 1) {
      adapter.registerEncoder({
        id: `encoder-${index}`,
        coordinates: { column: index, row: 0 },
        device: {
          id: "plus-device",
          size: { columns: 4, rows: 2 },
          type: 7,
        },
        setFeedback: vi.fn().mockResolvedValue(undefined),
        setFeedbackLayout: vi.fn().mockResolvedValue(undefined),
        setTriggerDescription: vi.fn().mockResolvedValue(undefined),
        showAlert: vi.fn().mockResolvedValue(undefined),
      } as never);
    }

    await vi.waitFor(() =>
      expect(
        images[0]?.mock.calls.some(([image]) =>
          renderedSvg(image).includes("Ready"),
        ),
      ).toBe(true),
    );
  });

  it("requests the previous profile for the managed Exit key", () => {
    let exitListener: (() => void) | undefined;
    const onExit = vi.fn((listener: () => void) => {
      exitListener = listener;
      return () => undefined;
    });
    const surface = {
      frame: { revision: 0, view: "home", keys: [], encoders: [] },
      onFrame: vi.fn(() => () => undefined),
      onExit,
      invalidatePhysicalInput: vi.fn(),
    } as unknown as PlusMvpSurface;
    const adapter = new StreamDeckPlusAdapter(surface);
    adapter.registerKey({
      id: "legacy-exit",
      coordinates: { column: 3, row: 1 },
      device: {
        id: "plus-device",
        size: { columns: 4, rows: 2 },
        type: 7,
      },
      setImage: vi.fn().mockResolvedValue(undefined),
      showAlert: vi.fn().mockResolvedValue(undefined),
    } as never);

    exitListener?.();

    expect(streamDeck.profiles.switchToProfile).toHaveBeenCalledWith(
      "plus-device",
    );
  });
});

function renderedSvg(image: unknown): string {
  const encoded = String(image).split(",", 2)[1] ?? "";
  return Buffer.from(encoded, "base64").toString("utf8");
}
