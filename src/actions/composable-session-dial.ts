import {
  action,
  type DialDownEvent,
  type DialRotateEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import type { ComposableControls } from "../composableControls.js";
import { COMPOSABLE_SESSION_DIAL_ACTION } from "../foundation.js";

@action({ UUID: COMPOSABLE_SESSION_DIAL_ACTION })
export class ComposableSessionDialAction extends SingletonAction {
  readonly #controls: ComposableControls;

  constructor(controls: ComposableControls) {
    super();
    this.#controls = controls;
  }

  override onWillAppear(event: WillAppearEvent): void {
    if (event.action.isDial()) this.#controls.registerSessionDial(event.action);
  }

  override onWillDisappear(event: WillDisappearEvent): void {
    this.#controls.unregister(event.action.id);
  }

  override onDialRotate(event: DialRotateEvent): void {
    this.#controls.rotateSessionDial(
      event.action,
      event.payload.ticks,
      event.payload.pressed,
    );
  }

  override onDialDown(event: DialDownEvent): Promise<void> {
    return this.#controls.pressSessionDial(event.action);
  }
}
