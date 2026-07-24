import {
  action,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import type { ComposableControls } from "../composableControls.js";
import { COMPOSABLE_REVIEW_ACTION } from "../foundation.js";

@action({ UUID: COMPOSABLE_REVIEW_ACTION })
export class ComposableReviewAction extends SingletonAction {
  readonly #controls: ComposableControls;

  constructor(controls: ComposableControls) {
    super();
    this.#controls = controls;
  }

  override onWillAppear(event: WillAppearEvent): void {
    if (event.action.isKey()) this.#controls.registerReview(event.action);
  }

  override onWillDisappear(event: WillDisappearEvent): void {
    this.#controls.unregister(event.action.id);
  }

  override onKeyDown(event: KeyDownEvent): void {
    this.#controls.reviewDown(event.action);
  }

  override onKeyUp(event: KeyUpEvent): Promise<void> {
    return this.#controls.reviewUp(event.action);
  }
}
