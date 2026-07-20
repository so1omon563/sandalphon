import {
  DeviceType,
  type DialAction,
  type FeedbackPayload,
  type KeyAction,
} from "@elgato/streamdeck";

import type { SurfaceApplicationBoundary } from "./application.js";
import type {
  ActionOffer,
  PrimaryState,
  SandalphonSnapshot,
  SessionSnapshot,
} from "./domain/model.js";
import type { KeyIcon } from "./keyIcons.js";
import { compactLabel } from "./plusMvp.js";
import {
  LIMINAL_SIGNAL_STATE_ACCENTS,
  renderManagedKey,
} from "./plusVisual.js";
import { moveStreamDeckPlusChoice } from "./streamDeckPlus.js";

interface ComposableKeyView {
  readonly label: string;
  readonly enabled: boolean;
  readonly state: PrimaryState;
  readonly icon: KeyIcon;
}

interface PressedResume {
  readonly revision: number;
  readonly offerToken: string;
}

interface PressedAttention {
  readonly revision: number;
  readonly sessionId: string;
}

interface RegisteredDial {
  readonly action: DialAction;
  previewSessionId: string | undefined;
}

export class ComposableControls {
  readonly #application: SurfaceApplicationBoundary;
  readonly #status = new Map<string, KeyAction>();
  readonly #resume = new Map<string, KeyAction>();
  readonly #attention = new Map<string, KeyAction>();
  readonly #sessionDials = new Map<string, RegisteredDial>();
  readonly #pressedResume = new Map<string, PressedResume>();
  readonly #pressedAttention = new Map<string, PressedAttention>();
  #snapshot: SandalphonSnapshot;
  #pendingSnapshot: SandalphonSnapshot | undefined;
  #rendering = false;
  #invocation = 0;

  constructor(application: SurfaceApplicationBoundary) {
    this.#application = application;
    this.#snapshot = application.snapshot;
    application.onSnapshot((snapshot) => {
      const selectedChanged =
        snapshot.selectedSessionId !== this.#snapshot.selectedSessionId;
      this.#snapshot = snapshot;
      if (selectedChanged) {
        for (const dial of this.#sessionDials.values()) {
          dial.previewSessionId = snapshot.selectedSessionId;
        }
      }
      this.#scheduleRender(snapshot);
    });
  }

  registerStatus(action: KeyAction): void {
    this.#status.set(action.id, action);
    this.#scheduleRender(this.#snapshot);
  }

  registerResume(action: KeyAction): void {
    this.#resume.set(action.id, action);
    this.#scheduleRender(this.#snapshot);
  }

  registerAttention(action: KeyAction): void {
    this.#attention.set(action.id, action);
    this.#scheduleRender(this.#snapshot);
  }

  registerSessionDial(action: DialAction): void {
    if (!isStandardPlus(action)) return;
    this.#sessionDials.set(action.id, {
      action,
      previewSessionId: this.#snapshot.selectedSessionId,
    });
    void action.setFeedbackLayout("layouts/plus-quarter.json");
    this.#scheduleRender(this.#snapshot);
  }

  unregister(actionId: string): void {
    this.#status.delete(actionId);
    this.#resume.delete(actionId);
    this.#attention.delete(actionId);
    this.#sessionDials.delete(actionId);
    this.#pressedResume.delete(actionId);
    this.#pressedAttention.delete(actionId);
  }

  resumeDown(action: KeyAction): void {
    if (!this.#resume.has(action.id)) return;
    const offer = resumeOffer(this.#snapshot);
    if (!offer?.offerToken) return;
    this.#pressedResume.set(action.id, {
      revision: this.#snapshot.revision,
      offerToken: offer.offerToken,
    });
  }

  async resumeUp(action: KeyAction): Promise<void> {
    const pressed = this.#pressedResume.get(action.id);
    this.#pressedResume.delete(action.id);
    const current = resumeOffer(this.#snapshot);
    if (
      !pressed ||
      pressed.revision !== this.#snapshot.revision ||
      pressed.offerToken !== current?.offerToken
    ) {
      return;
    }
    this.#invocation += 1;
    await this.#application.invoke({
      invocationId: `composable-resume:${this.#invocation}`,
      offerToken: pressed.offerToken,
    });
  }

  attentionDown(action: KeyAction): void {
    if (!this.#attention.has(action.id)) return;
    const target = attentionTarget(this.#snapshot);
    if (!target) return;
    this.#pressedAttention.set(action.id, {
      revision: this.#snapshot.revision,
      sessionId: target.id,
    });
  }

  async attentionUp(action: KeyAction): Promise<void> {
    const pressed = this.#pressedAttention.get(action.id);
    this.#pressedAttention.delete(action.id);
    const current = attentionTarget(this.#snapshot);
    if (
      !pressed ||
      pressed.revision !== this.#snapshot.revision ||
      pressed.sessionId !== current?.id
    ) {
      return;
    }
    await this.#application.selectSession(pressed.sessionId);
  }

  rotateSessionDial(action: DialAction, ticks: number, pressed: boolean): void {
    const registered = this.#sessionDials.get(action.id);
    if (!registered) return;
    const sessions = this.#snapshot.sessions;
    const current = Math.max(
      0,
      sessions.findIndex(({ id }) => id === registered.previewSessionId),
    );
    const next = moveStreamDeckPlusChoice(
      current,
      ticks,
      sessions.length,
      pressed,
    );
    registered.previewSessionId = sessions[next]?.id;
    this.#scheduleRender(this.#snapshot);
  }

  async pressSessionDial(action: DialAction): Promise<void> {
    const registered = this.#sessionDials.get(action.id);
    if (!registered?.previewSessionId) return;
    const target = this.#snapshot.sessions.find(
      ({ id }) => id === registered.previewSessionId,
    );
    if (!target) return;
    await this.#application.selectSession(target.id);
  }

  #scheduleRender(snapshot: SandalphonSnapshot): void {
    this.#pendingSnapshot = snapshot;
    if (this.#rendering) return;
    this.#rendering = true;
    void this.#drainRenderQueue();
  }

  async #drainRenderQueue(): Promise<void> {
    while (this.#pendingSnapshot) {
      const snapshot = this.#pendingSnapshot;
      this.#pendingSnapshot = undefined;
      await Promise.all([
        ...[...this.#status.values()].map((action) =>
          renderKey(action, statusView(snapshot)),
        ),
        ...[...this.#resume.values()].map((action) =>
          renderKey(action, resumeView(snapshot)),
        ),
        ...[...this.#attention.values()].map((action) =>
          renderKey(action, attentionView(snapshot)),
        ),
        ...[...this.#sessionDials.values()].map((dial) =>
          renderDial(dial, snapshot),
        ),
      ]);
    }
    this.#rendering = false;
  }
}

function selectedSession(
  snapshot: SandalphonSnapshot,
): SessionSnapshot | undefined {
  return snapshot.sessions.find(({ id }) => id === snapshot.selectedSessionId);
}

function resumeOffer(snapshot: SandalphonSnapshot): ActionOffer | undefined {
  return selectedSession(snapshot)?.actionOffers.find(
    ({ kind, state }) => kind === "ResumeSession" && state === "available",
  );
}

function attentionTarget(
  snapshot: SandalphonSnapshot,
): SessionSnapshot | undefined {
  const attention = snapshot.sessions.filter(
    (session) => session.attention.length > 0,
  );
  return (
    attention.find(({ id }) => id !== snapshot.selectedSessionId) ??
    attention[0]
  );
}

function statusView(snapshot: SandalphonSnapshot): ComposableKeyView {
  const selected = selectedSession(snapshot);
  if (!selected || snapshot.integration.phase !== "ready") {
    return {
      label: "Offline",
      enabled: false,
      state: "unavailable",
      icon: "state",
    };
  }
  return {
    label: compactLabel(selected.name, 24),
    enabled: false,
    state: selected.primaryState,
    icon: "session",
  };
}

function resumeView(snapshot: SandalphonSnapshot): ComposableKeyView {
  const selected = selectedSession(snapshot);
  const offer = resumeOffer(snapshot);
  if (!selected || !offer) {
    return {
      label: "",
      enabled: false,
      state: selected?.primaryState ?? "unavailable",
      icon: "resume",
    };
  }
  return {
    label: "Resume",
    enabled: true,
    state: selected.primaryState,
    icon: "resume",
  };
}

function attentionView(snapshot: SandalphonSnapshot): ComposableKeyView {
  const attention = snapshot.sessions.filter(
    (session) => session.attention.length > 0,
  );
  if (attention.length === 0) {
    return {
      label: "",
      enabled: false,
      state: selectedSession(snapshot)?.primaryState ?? "unavailable",
      icon: "attention",
    };
  }
  return {
    label:
      attention.length === 1 ? "Attention" : `${attention.length} attention`,
    enabled: true,
    state: attentionTarget(snapshot)?.primaryState ?? "waiting",
    icon: "attention",
  };
}

async function renderKey(
  action: KeyAction,
  view: ComposableKeyView,
): Promise<void> {
  try {
    await Promise.all([
      action.setImage(renderManagedKey(view)),
      action.setTitle(""),
    ]);
  } catch {
    await safeAlert(action);
  }
}

async function renderDial(
  dial: RegisteredDial,
  snapshot: SandalphonSnapshot,
): Promise<void> {
  const selected = selectedSession(snapshot);
  const preview =
    snapshot.sessions.find(({ id }) => id === dial.previewSessionId) ??
    selected;
  const index = preview
    ? snapshot.sessions.findIndex(({ id }) => id === preview.id)
    : -1;
  const feedback: FeedbackPayload = preview
    ? {
        heading:
          preview.id === snapshot.selectedSessionId ? "Sessions" : "Preview",
        detail: `${compactLabel(preview.name, 18)} · ${index + 1}/${snapshot.sessions.length}`,
        rail: {
          value: 100,
          bar_bg_c: "#172348",
          bar_fill_c: LIMINAL_SIGNAL_STATE_ACCENTS[preview.primaryState],
        },
      }
    : {
        heading: "Offline",
        detail: snapshot.integration.reason ?? "Starting",
        rail: {
          value: 100,
          bar_bg_c: "#172348",
          bar_fill_c: LIMINAL_SIGNAL_STATE_ACCENTS.unavailable,
        },
      };
  try {
    await dial.action.setFeedback(feedback);
    await dial.action.setTriggerDescription({
      rotate: snapshot.sessions.length > 1 ? "Preview sessions" : "",
      push:
        preview && preview.id !== snapshot.selectedSessionId ? "Select" : "",
      touch: "",
      longTouch: "",
    });
  } catch {
    await safeAlert(dial.action);
  }
}

function isStandardPlus(action: DialAction): boolean {
  return (
    action.device.type === DeviceType.StreamDeckPlus &&
    action.device.size.columns === 4 &&
    action.device.size.rows === 2
  );
}

async function safeAlert(action: KeyAction | DialAction): Promise<void> {
  try {
    await action.showAlert();
  } catch {
    // The device may disappear while the original render failure is handled.
  }
}
