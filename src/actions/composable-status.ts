import {
  action,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import type { ComposableControls } from "../composableControls.js";
import { COMPOSABLE_STATUS_ACTION } from "../foundation.js";

@action({ UUID: COMPOSABLE_STATUS_ACTION })
export class ComposableStatusAction extends SingletonAction {
  readonly #controls: ComposableControls;

  constructor(controls: ComposableControls) {
    super();
    this.#controls = controls;
  }

  override onWillAppear(event: WillAppearEvent): void {
    if (event.action.isKey()) this.#controls.registerStatus(event.action);
  }

  override onWillDisappear(event: WillDisappearEvent): void {
    this.#controls.unregister(event.action.id);
  }
}
