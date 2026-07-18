import {
  action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { FOUNDATION_STATUS_ACTION, FOUNDATION_VIEW } from "../foundation.js";

@action({ UUID: FOUNDATION_STATUS_ACTION })
export class FoundationStatusAction extends SingletonAction {
  override onWillAppear(event: WillAppearEvent): Promise<void> {
    return event.action.setTitle(FOUNDATION_VIEW.title);
  }

  override onKeyDown(event: KeyDownEvent): Promise<void> {
    return event.action.showOk();
  }
}
