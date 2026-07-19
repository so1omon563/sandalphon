import {
  action,
  type DialDownEvent,
  type DialRotateEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { MANAGED_PLUS_ENCODER_ACTION } from "../foundation.js";
import type { StreamDeckPlusAdapter } from "../streamDeckPlusAdapter.js";

@action({ UUID: MANAGED_PLUS_ENCODER_ACTION })
export class ManagedPlusEncoderAction extends SingletonAction {
  readonly #adapter: StreamDeckPlusAdapter;

  constructor(adapter: StreamDeckPlusAdapter) {
    super();
    this.#adapter = adapter;
  }

  override onWillAppear(event: WillAppearEvent): void {
    if (event.action.isDial()) this.#adapter.registerEncoder(event.action);
  }

  override onWillDisappear(event: WillDisappearEvent): void {
    this.#adapter.unregister(event.action.id);
  }

  override onDialRotate(event: DialRotateEvent): void {
    this.#adapter.rotate(
      event.action,
      event.payload.ticks,
      event.payload.pressed,
      Date.now(),
    );
  }

  override onDialDown(event: DialDownEvent): Promise<void> {
    return this.#adapter.press(event.action, Date.now());
  }

  override onTouchTap(event: TouchTapEvent): void {
    this.#adapter.touch(event.action, event.payload.hold);
  }
}
