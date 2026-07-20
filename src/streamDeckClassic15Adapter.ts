import streamDeck, { DeviceType, type KeyAction } from "@elgato/streamdeck";

import type { Classic15MvpFrame, Classic15MvpSurface } from "./classic15Mvp.js";
import { renderManagedKey } from "./plusVisual.js";

interface RegisteredKey {
  readonly action: KeyAction;
  readonly index: number;
}

export class StreamDeckClassic15Adapter {
  readonly #surface: Classic15MvpSurface;
  readonly #keys = new Map<string, RegisteredKey>();
  #pendingFrame: Classic15MvpFrame | undefined;
  #rendering = false;

  constructor(surface: Classic15MvpSurface) {
    this.#surface = surface;
    surface.onFrame((frame) => this.#scheduleRender(frame));
    surface.onExit(() => {
      for (const { action, index } of this.#keys.values()) {
        if (index === 14) {
          void streamDeck.profiles.switchToProfile(action.device.id);
        }
      }
    });
  }

  registerKey(action: KeyAction): void {
    if (!isClassic15(action) || !action.coordinates) return;
    const index = action.coordinates.row * 5 + action.coordinates.column;
    if (index < 0 || index >= 15) return;
    this.#keys.set(action.id, { action, index });
    this.#scheduleRender(this.#surface.frame);
  }

  unregister(actionId: string): void {
    const existed = this.#keys.delete(actionId);
    if (existed) this.#surface.invalidatePhysicalInput();
  }

  keyDown(action: KeyAction, now: number): void {
    const registered = this.#keys.get(action.id);
    if (!registered || !this.#isReady(action.device.id)) return;
    this.#surface.keyDown(registered.index, now);
    setTimeout(() => void this.#surface.timeAdvanced(Date.now()), 800);
  }

  async keyUp(action: KeyAction, now: number): Promise<void> {
    const registered = this.#keys.get(action.id);
    if (!registered || !this.#isReady(action.device.id)) return;
    await this.#surface.keyUp(registered.index, now);
  }

  #scheduleRender(frame: Classic15MvpFrame): void {
    this.#pendingFrame = frame;
    if (this.#rendering) return;
    this.#rendering = true;
    void this.#drainRenderQueue();
  }

  async #drainRenderQueue(): Promise<void> {
    while (this.#pendingFrame) {
      const frame = this.#pendingFrame;
      this.#pendingFrame = undefined;
      await Promise.all(
        [...this.#keys.values()].map(({ action, index }) =>
          this.#renderKey(action, index, frame),
        ),
      );
    }
    this.#rendering = false;
  }

  async #renderKey(
    action: KeyAction,
    index: number,
    frame: Classic15MvpFrame,
  ): Promise<void> {
    const view = this.#isReady(action.device.id)
      ? frame.keys[index]
      : {
          index,
          label: "Loading",
          enabled: false,
          state: "unavailable" as const,
          icon: "state" as const,
        };
    if (!view) return;
    try {
      await Promise.all([
        action.setImage(renderManagedKey(view)),
        action.setTitle(""),
      ]);
    } catch {
      try {
        await action.showAlert();
      } catch {
        // The device may have disappeared while handling the original failure.
      }
    }
  }

  #isReady(deviceId: string): boolean {
    const keys = [...this.#keys.values()].filter(
      ({ action }) => action.device.id === deviceId,
    );
    return keys.length === 15;
  }
}

function isClassic15(action: KeyAction): boolean {
  return (
    action.device.type === DeviceType.StreamDeck &&
    action.device.size.columns === 5 &&
    action.device.size.rows === 3
  );
}
