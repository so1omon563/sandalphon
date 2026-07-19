import streamDeck, {
  action,
  DeviceType,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import {
  FOUNDATION_STATUS_ACTION,
  FOUNDATION_VIEW,
  SANDALPHON_CLASSIC15_PROFILE,
  SANDALPHON_PLUS_PROFILE,
} from "../foundation.js";

@action({ UUID: FOUNDATION_STATUS_ACTION })
export class FoundationStatusAction extends SingletonAction {
  override onWillAppear(event: WillAppearEvent): Promise<void> {
    return event.action.setTitle(FOUNDATION_VIEW.title);
  }

  override async onKeyDown(event: KeyDownEvent): Promise<void> {
    const profile =
      event.action.device.type === DeviceType.StreamDeck &&
      event.action.device.size.columns === 5 &&
      event.action.device.size.rows === 3
        ? SANDALPHON_CLASSIC15_PROFILE
        : event.action.device.type === DeviceType.StreamDeckPlus &&
            event.action.device.size.columns === 4 &&
            event.action.device.size.rows === 2
          ? SANDALPHON_PLUS_PROFILE
          : undefined;
    if (!profile) {
      await event.action.showAlert();
      return;
    }
    await streamDeck.profiles.switchToProfile(event.action.device.id, profile);
  }
}
