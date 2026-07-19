import streamDeck from "@elgato/streamdeck";

import { FoundationStatusAction } from "./actions/foundation-status.js";
import { ManagedPlusEncoderAction } from "./actions/managed-plus-encoder.js";
import { ManagedPlusAction } from "./actions/managed-plus.js";
import { SandalphonApplication, type SettingsStore } from "./application.js";
import type { SandalphonSettings } from "./codex/configuration.js";
import { PlusMvpSurface } from "./plusMvp.js";
import { StreamDeckPlusAdapter } from "./streamDeckPlusAdapter.js";

const settingsStore: SettingsStore = {
  read: () => streamDeck.settings.getGlobalSettings(),
  write: (settings: SandalphonSettings) =>
    streamDeck.settings.setGlobalSettings({ ...settings }),
};
const application = new SandalphonApplication(settingsStore);
const plusSurface = new PlusMvpSurface(application);
const plusAdapter = new StreamDeckPlusAdapter(plusSurface);

streamDeck.actions.registerAction(new FoundationStatusAction());
streamDeck.actions.registerAction(new ManagedPlusAction(plusAdapter));
streamDeck.actions.registerAction(new ManagedPlusEncoderAction(plusAdapter));

await streamDeck.connect();
await application.start();
