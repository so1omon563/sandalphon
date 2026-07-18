import streamDeck from "@elgato/streamdeck";

import { FoundationStatusAction } from "./actions/foundation-status.js";

streamDeck.actions.registerAction(new FoundationStatusAction());

await streamDeck.connect();
