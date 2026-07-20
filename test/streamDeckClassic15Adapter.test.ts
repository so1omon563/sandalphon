import { describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";

vi.mock("@elgato/streamdeck", () => ({
  default: { profiles: { switchToProfile: vi.fn() } },
  DeviceType: { StreamDeck: 0 },
}));

import type { Classic15MvpSurface } from "../src/classic15Mvp.js";
import { StreamDeckClassic15Adapter } from "../src/streamDeckClassic15Adapter.js";
import streamDeck from "@elgato/streamdeck";

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

  it("becomes ready with the complete managed Classic 15 surface", async () => {
    const surface = {
      frame: {
        revision: 1,
        view: "home",
        keys: Array.from({ length: 15 }, (_, index) => ({
          index,
          label: "Ready",
          enabled: true,
          state: "idle",
          icon: "state",
        })),
      },
      onFrame: vi.fn(() => () => undefined),
      onExit: vi.fn(() => () => undefined),
      invalidatePhysicalInput: vi.fn(),
    } as unknown as Classic15MvpSurface;
    const images = Array.from({ length: 15 }, () => vi.fn());
    const adapter = new StreamDeckClassic15Adapter(surface);

    for (let index = 0; index < 15; index += 1) {
      adapter.registerKey({
        id: `key-${index}`,
        coordinates: { column: index % 5, row: Math.floor(index / 5) },
        device: {
          id: "classic-device",
          size: { columns: 5, rows: 3 },
          type: 0,
        },
        setImage: images[index],
        setTitle: vi.fn().mockResolvedValue(undefined),
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
      frame: { revision: 0, view: "home", keys: [] },
      onFrame: vi.fn(() => () => undefined),
      onExit,
      invalidatePhysicalInput: vi.fn(),
    } as unknown as Classic15MvpSurface;
    const adapter = new StreamDeckClassic15Adapter(surface);
    adapter.registerKey({
      id: "legacy-exit",
      coordinates: { column: 4, row: 2 },
      device: {
        id: "classic-device",
        size: { columns: 5, rows: 3 },
        type: 0,
      },
      setImage: vi.fn().mockResolvedValue(undefined),
      setTitle: vi.fn().mockResolvedValue(undefined),
      showAlert: vi.fn().mockResolvedValue(undefined),
    } as never);

    exitListener?.();

    expect(streamDeck.profiles.switchToProfile).toHaveBeenCalledWith(
      "classic-device",
    );
  });
});

function renderedSvg(image: unknown): string {
  const encoded = String(image).split(",", 2)[1] ?? "";
  return Buffer.from(encoded, "base64").toString("utf8");
}
