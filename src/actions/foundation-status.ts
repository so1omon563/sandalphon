import streamDeck, {
  action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { FOUNDATION_STATUS_ACTION, FOUNDATION_VIEW } from "../foundation.js";
import { SANDALPHON_PLUS_PROFILE } from "../foundation.js";

@action({ UUID: FOUNDATION_STATUS_ACTION })
export class FoundationStatusAction extends SingletonAction {
  override onWillAppear(event: WillAppearEvent): Promise<void> {
    return event.action.setTitle(FOUNDATION_VIEW.title);
  }

  override async onKeyDown(event: KeyDownEvent): Promise<void> {
    await streamDeck.profiles.switchToProfile(
      event.action.device.id,
      SANDALPHON_PLUS_PROFILE,
    );
  }
}
