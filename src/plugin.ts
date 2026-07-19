import streamDeck from "@elgato/streamdeck";

import { FoundationStatusAction } from "./actions/foundation-status.js";
import { ManagedClassic15Action } from "./actions/managed-classic15.js";
import { ManagedPlusEncoderAction } from "./actions/managed-plus-encoder.js";
import { ManagedPlusAction } from "./actions/managed-plus.js";
import { SandalphonApplication, type SettingsStore } from "./application.js";
import type { SandalphonSettings } from "./codex/configuration.js";
import { Classic15MvpSurface } from "./classic15Mvp.js";
import { PlusMvpSurface } from "./plusMvp.js";
import { StreamDeckClassic15Adapter } from "./streamDeckClassic15Adapter.js";
import { StreamDeckPlusAdapter } from "./streamDeckPlusAdapter.js";

const settingsStore: SettingsStore = {
  read: () => streamDeck.settings.getGlobalSettings(),
  write: (settings: SandalphonSettings) =>
    streamDeck.settings.setGlobalSettings({ ...settings }),
};
const application = new SandalphonApplication(settingsStore);
const classic15Surface = new Classic15MvpSurface(application);
const classic15Adapter = new StreamDeckClassic15Adapter(classic15Surface);
const plusSurface = new PlusMvpSurface(application);
const plusAdapter = new StreamDeckPlusAdapter(plusSurface);

streamDeck.actions.registerAction(new FoundationStatusAction());
streamDeck.actions.registerAction(new ManagedClassic15Action(classic15Adapter));
streamDeck.actions.registerAction(new ManagedPlusAction(plusAdapter));
streamDeck.actions.registerAction(new ManagedPlusEncoderAction(plusAdapter));

await streamDeck.connect();
await application.start();
