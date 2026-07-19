import {
  action,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { MANAGED_PLUS_ACTION } from "../foundation.js";
import type { StreamDeckPlusAdapter } from "../streamDeckPlusAdapter.js";

@action({ UUID: MANAGED_PLUS_ACTION })
export class ManagedPlusAction extends SingletonAction {
  readonly #adapter: StreamDeckPlusAdapter;

  constructor(adapter: StreamDeckPlusAdapter) {
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
