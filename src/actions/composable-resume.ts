import {
  action,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import type { ComposableControls } from "../composableControls.js";
import { COMPOSABLE_RESUME_ACTION } from "../foundation.js";

@action({ UUID: COMPOSABLE_RESUME_ACTION })
export class ComposableResumeAction extends SingletonAction {
  readonly #controls: ComposableControls;

  constructor(controls: ComposableControls) {
    super();
    this.#controls = controls;
  }

  override onWillAppear(event: WillAppearEvent): void {
    if (event.action.isKey()) this.#controls.registerResume(event.action);
  }

  override onWillDisappear(event: WillDisappearEvent): void {
    this.#controls.unregister(event.action.id);
  }

  override onKeyDown(event: KeyDownEvent): void {
    this.#controls.resumeDown(event.action);
  }

  override onKeyUp(event: KeyUpEvent): Promise<void> {
    return this.#controls.resumeUp(event.action);
  }
}
