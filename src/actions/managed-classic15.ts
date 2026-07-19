import {
  action,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { MANAGED_CLASSIC15_ACTION } from "../foundation.js";
import type { StreamDeckClassic15Adapter } from "../streamDeckClassic15Adapter.js";

@action({ UUID: MANAGED_CLASSIC15_ACTION })
export class ManagedClassic15Action extends SingletonAction {
  readonly #adapter: StreamDeckClassic15Adapter;

  constructor(adapter: StreamDeckClassic15Adapter) {
    super();
    this.#adapter = adapter;
  }

  override onWillAppear(event: WillAppearEvent): void {
    if (event.action.isKey()) this.#adapter.registerKey(event.action);
  }

  override onWillDisappear(event: WillDisappearEvent): void {
    this.#adapter.unregister(event.action.id);
  }

  override onKeyDown(event: KeyDownEvent): void {
    this.#adapter.keyDown(event.action, Date.now());
  }

  override onKeyUp(event: KeyUpEvent): Promise<void> {
    return this.#adapter.keyUp(event.action, Date.now());
  }
}
