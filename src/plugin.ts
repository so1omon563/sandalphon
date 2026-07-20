import streamDeck from "@elgato/streamdeck";

import { ComposableAttentionAction } from "./actions/composable-attention.js";
import { ComposableResumeAction } from "./actions/composable-resume.js";
import { ComposableSessionDialAction } from "./actions/composable-session-dial.js";
import { ComposableStatusAction } from "./actions/composable-status.js";
import { FoundationStatusAction } from "./actions/foundation-status.js";
import { ManagedClassic15Action } from "./actions/managed-classic15.js";
import { ManagedPlusEncoderAction } from "./actions/managed-plus-encoder.js";
import { ManagedPlusAction } from "./actions/managed-plus.js";
import { SandalphonApplication, type SettingsStore } from "./application.js";
import type { SandalphonSettings } from "./codex/configuration.js";
import { Classic15MvpSurface } from "./classic15Mvp.js";
import { ComposableControls } from "./composableControls.js";
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
const composableControls = new ComposableControls(application);
let desktopControlUpdate = Promise.resolve();

const sendDesktopControlStatus = (): Promise<void> =>
  streamDeck.ui
    .sendToPropertyInspector({
      type: "desktopControl.status",
      enabled: application.desktopControlEnabled,
      status: application.desktopControlStatus,
    })
    .catch(() => undefined);

streamDeck.ui.onDidAppear(() => void sendDesktopControlStatus());
streamDeck.ui.onSendToPlugin((event) => {
  const payload = event.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  const record = payload as Record<string, unknown>;
  desktopControlUpdate = desktopControlUpdate
    .then(async () => {
      if (
        record.type === "desktopControl.setEnabled" &&
        typeof record.enabled === "boolean"
      ) {
        await application.setDesktopControlEnabled(record.enabled);
      } else if (record.type === "desktopControl.retry") {
        await application.retryDesktopControl();
      }
    })
    .then(sendDesktopControlStatus)
    .catch(() => undefined);
});
application.onDesktopControlStatus(() => void sendDesktopControlStatus());

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  await application.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

streamDeck.actions.registerAction(
  new ComposableStatusAction(composableControls),
);
streamDeck.actions.registerAction(
  new ComposableResumeAction(composableControls),
);
streamDeck.actions.registerAction(
  new ComposableAttentionAction(composableControls),
);
streamDeck.actions.registerAction(
  new ComposableSessionDialAction(composableControls),
);
streamDeck.actions.registerAction(new FoundationStatusAction());
streamDeck.actions.registerAction(new ManagedClassic15Action(classic15Adapter));
streamDeck.actions.registerAction(new ManagedPlusAction(plusAdapter));
streamDeck.actions.registerAction(new ManagedPlusEncoderAction(plusAdapter));

await streamDeck.connect();
await application.start();
