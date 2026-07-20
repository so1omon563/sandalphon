import {
  action,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import type { ComposableControls } from "../composableControls.js";
import { COMPOSABLE_ATTENTION_ACTION } from "../foundation.js";

@action({ UUID: COMPOSABLE_ATTENTION_ACTION })
export class ComposableAttentionAction extends SingletonAction {
  readonly #controls: ComposableControls;

  constructor(controls: ComposableControls) {
    super();
    this.#controls = controls;
  }

  override onWillAppear(event: WillAppearEvent): void {
    if (event.action.isKey()) this.#controls.registerAttention(event.action);
  }

  override onWillDisappear(event: WillDisappearEvent): void {
    this.#controls.unregister(event.action.id);
  }

  override onKeyDown(event: KeyDownEvent): void {
    this.#controls.attentionDown(event.action);
  }

  override onKeyUp(event: KeyUpEvent): Promise<void> {
    return this.#controls.attentionUp(event.action);
  }
}
