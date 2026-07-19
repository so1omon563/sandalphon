import streamDeck, {
  DeviceType,
  type DialAction,
  type FeedbackPayload,
  type KeyAction,
} from "@elgato/streamdeck";

import type {
  PlusEncoderView,
  PlusMvpFrame,
  PlusMvpSurface,
} from "./plusMvp.js";
import { LIMINAL_SIGNAL_STATE_ACCENTS, renderPlusKey } from "./plusVisual.js";

interface RegisteredKey {
  readonly action: KeyAction;
  readonly index: number;
}

interface RegisteredEncoder {
  readonly action: DialAction;
  readonly index: number;
}

export class StreamDeckPlusAdapter {
  readonly #surface: PlusMvpSurface;
  readonly #keys = new Map<string, RegisteredKey>();
  readonly #encoders = new Map<string, RegisteredEncoder>();
  #pendingFrame: PlusMvpFrame | undefined;
  #rendering = false;

  constructor(surface: PlusMvpSurface) {
    this.#surface = surface;
    surface.onFrame((frame) => this.#scheduleRender(frame));
    surface.onExit(() => {
      for (const deviceId of this.#deviceIds()) {
        void streamDeck.profiles.switchToProfile(deviceId);
      }
    });
  }

  registerKey(action: KeyAction): void {
    if (!isStandardPlus(action) || !action.coordinates) return;
    const index = action.coordinates.row * 4 + action.coordinates.column;
    if (index < 0 || index >= 8) return;
    this.#keys.set(action.id, { action, index });
    this.#scheduleRender(this.#surface.frame);
  }

  registerEncoder(action: DialAction): void {
    if (!isStandardPlus(action)) return;
    const index = action.coordinates.column;
    if (index < 0 || index >= 4) return;
    this.#encoders.set(action.id, { action, index });
    void action.setFeedbackLayout("layouts/plus-quarter.json");
    this.#scheduleRender(this.#surface.frame);
  }

  unregister(actionId: string): void {
    const key = this.#keys.get(actionId);
    const encoder = this.#encoders.get(actionId);
    this.#keys.delete(actionId);
    this.#encoders.delete(actionId);
    if (key || encoder) this.#surface.invalidatePhysicalInput();
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

  rotate(
    action: DialAction,
    ticks: number,
    pressed: boolean,
    now: number,
  ): void {
    const registered = this.#encoders.get(action.id);
    if (!registered || !this.#isReady(action.device.id)) return;
    this.#surface.rotateEncoder(registered.index, ticks, pressed, now);
  }

  async press(action: DialAction, now: number): Promise<void> {
    const registered = this.#encoders.get(action.id);
    if (!registered || !this.#isReady(action.device.id)) return;
    await this.#surface.pressEncoder(registered.index, now);
  }

  touch(action: DialAction, hold: boolean): void {
    const registered = this.#encoders.get(action.id);
    if (!registered || !this.#isReady(action.device.id)) return;
    this.#surface.touchEncoder(registered.index, hold);
  }

  #scheduleRender(frame: PlusMvpFrame): void {
    this.#pendingFrame = frame;
    if (this.#rendering) return;
    this.#rendering = true;
    void this.#drainRenderQueue();
  }

  async #drainRenderQueue(): Promise<void> {
    while (this.#pendingFrame) {
      const frame = this.#pendingFrame;
      this.#pendingFrame = undefined;
      await Promise.all([
        ...[...this.#keys.values()].map(({ action, index }) =>
          this.#renderKey(action, index, frame),
        ),
        ...[...this.#encoders.values()].map(({ action, index }) =>
          this.#renderEncoder(action, index, frame),
        ),
      ]);
    }
    this.#rendering = false;
  }

  async #renderKey(
    action: KeyAction,
    index: number,
    frame: PlusMvpFrame,
  ): Promise<void> {
    const ready = this.#isReady(action.device.id);
    const view = ready
      ? frame.keys[index]
      : {
          index,
          label: "Loading",
          enabled: false,
          state: "unavailable" as const,
        };
    if (!view) return;
    try {
      await action.setImage(renderPlusKey(view));
    } catch {
      await safeAlert(action);
    }
  }

  async #renderEncoder(
    action: DialAction,
    index: number,
    frame: PlusMvpFrame,
  ): Promise<void> {
    const view = this.#isReady(action.device.id)
      ? frame.encoders[index]
      : loadingEncoder(index);
    if (!view) return;
    const feedback: FeedbackPayload = {
      heading: view.title,
      detail: view.detail,
      rail: {
        value: 100,
        bar_bg_c: "#172348",
        bar_fill_c: LIMINAL_SIGNAL_STATE_ACCENTS[view.state],
      },
    };
    try {
      await action.setFeedback(feedback);
      await action.setTriggerDescription({
        rotate: view.rotate,
        push: view.press,
        touch: view.touch,
        longTouch: "",
      });
    } catch {
      await safeAlert(action);
    }
  }

  #isReady(deviceId: string): boolean {
    const keys = [...this.#keys.values()].filter(
      ({ action }) => action.device.id === deviceId,
    );
    const encoders = [...this.#encoders.values()].filter(
      ({ action }) => action.device.id === deviceId,
    );
    return keys.length === 8 && encoders.length === 4;
  }

  #deviceIds(): string[] {
    return [
      ...new Set([
        ...[...this.#keys.values()].map(({ action }) => action.device.id),
        ...[...this.#encoders.values()].map(({ action }) => action.device.id),
      ]),
    ];
  }
}

function isStandardPlus(action: KeyAction | DialAction): boolean {
  return (
    action.device.type === DeviceType.StreamDeckPlus &&
    action.device.size.columns === 4 &&
    action.device.size.rows === 2
  );
}

function loadingEncoder(index: number): PlusEncoderView {
  return {
    index,
    title: index === 0 ? "Sandalphon" : "Loading",
    detail: "Waiting for full profile",
    state: "unavailable",
    rotate: "",
    press: "",
    touch: "",
  };
}

async function safeAlert(action: KeyAction | DialAction): Promise<void> {
  try {
    await action.showAlert();
  } catch {
    // The device may have disappeared while handling the original failure.
  }
}
