import type { ActionKind, SandalphonSnapshot } from "./domain/model.js";
import { moveStreamDeckPlusChoice } from "./streamDeckPlus.js";

export type SurfaceProfile = "classic15" | "streamDeckPlus";
export type SurfaceScope = "managed" | "composable";
export type SurfaceView =
  "home" | "session" | "actions" | "choice" | "request" | "unavailable";

export interface VisibleControl {
  readonly id: string;
  readonly controller: "keypad" | "encoder";
  readonly owned: boolean;
}

export interface SurfaceRuntime {
  readonly runtimeDeviceId: string;
  readonly connected: boolean;
  readonly observedKeyGrid: readonly [number, number];
  readonly encoderCount: number;
  readonly touchStrip: boolean;
  readonly profile: SurfaceProfile;
  readonly scope: SurfaceScope;
  readonly visibleControls: readonly VisibleControl[];
  readonly local: {
    readonly revision: number;
    readonly view: SurfaceView;
    readonly previewIndex: number;
  };
}

export interface ControlView {
  readonly id: string;
  readonly role: "status" | "back" | "action" | "choice" | "empty";
  readonly enabled: boolean;
  readonly label: string;
  readonly offerToken?: string;
  readonly actionKind?: ActionKind;
  readonly optionIds?: readonly string[];
  readonly unavailableReason?: "managedSurfaceRequired" | "surfaceUnavailable";
}

export interface PresentationFrame {
  readonly frameRevision: string;
  readonly snapshotRevision: number;
  readonly surfaceProfile: SurfaceProfile;
  readonly surfaceView: SurfaceView;
  readonly keyViews: readonly ControlView[];
  readonly encoderViews: readonly ControlView[];
  readonly unavailableReasons: readonly string[];
  readonly fullStripCoordinated: boolean;
}

export function recognizeProfile(
  runtime: Pick<
    SurfaceRuntime,
    "observedKeyGrid" | "encoderCount" | "touchStrip"
  >,
): SurfaceProfile | undefined {
  const [columns, rows] = runtime.observedKeyGrid;
  if (columns === 5 && rows === 3 && runtime.encoderCount === 0) {
    return "classic15";
  }
  if (
    columns === 4 &&
    rows === 2 &&
    runtime.encoderCount === 4 &&
    runtime.touchStrip
  ) {
    return "streamDeckPlus";
  }
  return undefined;
}

export function present(
  snapshot: SandalphonSnapshot,
  runtime: SurfaceRuntime,
): PresentationFrame {
  const recognized = recognizeProfile(runtime);
  const compatible = recognized === runtime.profile;
  const unavailableReasons = [
    ...(!runtime.connected ? ["deviceDisconnected"] : []),
    ...(!compatible ? ["profileMismatch"] : []),
  ];
  const view =
    unavailableReasons.length > 0 ? "unavailable" : runtime.local.view;
  const selected = snapshot.sessions.find(
    ({ id }) => id === snapshot.selectedSessionId,
  );
  const offers = selected?.actionOffers ?? [];
  const owned = runtime.visibleControls.filter(({ owned }) => owned);
  const keyCount =
    runtime.scope === "managed" ? managedKeyCount(runtime.profile) : undefined;
  const encoderCount =
    runtime.scope === "managed" && runtime.profile === "streamDeckPlus"
      ? 4
      : undefined;
  const keyIds =
    keyCount === undefined
      ? owned
          .filter(({ controller }) => controller === "keypad")
          .map(({ id }) => id)
      : Array.from({ length: keyCount }, (_, index) => `key-${index}`);
  const encoderIds =
    encoderCount === undefined
      ? owned
          .filter(({ controller }) => controller === "encoder")
          .map(({ id }) => id)
      : Array.from({ length: encoderCount }, (_, index) => `encoder-${index}`);

  return {
    frameRevision: `${snapshot.revision}:${runtime.local.revision}`,
    snapshotRevision: snapshot.revision,
    surfaceProfile: runtime.profile,
    surfaceView: view,
    keyViews: keyIds.map((id, index) =>
      controlView(
        id,
        index,
        selected?.primaryState ?? "unavailable",
        offers,
        runtime.scope,
        unavailableReasons.length === 0,
      ),
    ),
    encoderViews: encoderIds.map((id, index) =>
      encoderControlView(id, index, offers, unavailableReasons.length === 0),
    ),
    unavailableReasons,
    fullStripCoordinated:
      unavailableReasons.length === 0 &&
      runtime.scope === "managed" &&
      runtime.profile === "streamDeckPlus" &&
      owned.filter(({ controller }) => controller === "encoder").length === 4,
  };
}

export function rotatePreview(
  runtime: SurfaceRuntime,
  ticks: number,
  optionCount: number,
  pressed = false,
): SurfaceRuntime {
  if (runtime.profile !== "streamDeckPlus" || optionCount <= 0 || ticks === 0) {
    return runtime;
  }
  const previewIndex = moveStreamDeckPlusChoice(
    runtime.local.previewIndex,
    ticks,
    optionCount,
    pressed,
  );
  if (previewIndex === runtime.local.previewIndex) return runtime;
  return {
    ...runtime,
    local: {
      ...runtime.local,
      revision: runtime.local.revision + 1,
      previewIndex,
    },
  };
}

function managedKeyCount(profile: SurfaceProfile): number {
  return profile === "classic15" ? 15 : 8;
}

function controlView(
  id: string,
  index: number,
  primaryState: string,
  offers: SandalphonSnapshot["sessions"][number]["actionOffers"],
  scope: SurfaceScope,
  surfaceAvailable: boolean,
): ControlView {
  if (index === 0) {
    return {
      id,
      role: "status",
      enabled: true,
      label: primaryState,
    };
  }
  const offer = offers[index - 1];
  if (!offer) return { id, role: "empty", enabled: false, label: "" };
  const managedRequired =
    scope === "composable" &&
    (offer.safety.confirmation === "reviewPress" ||
      offer.safety.confirmation === "reviewHold");
  return {
    id,
    role: offer.kind === "ChangeNextTurnOptions" ? "choice" : "action",
    enabled:
      offer.state === "available" && !managedRequired && surfaceAvailable,
    label: offer.kind,
    ...(offer.offerToken && !managedRequired && surfaceAvailable
      ? { offerToken: offer.offerToken }
      : {}),
    ...(offer.optionIds ? { optionIds: offer.optionIds } : {}),
    actionKind: offer.kind,
    ...(managedRequired ? { unavailableReason: "managedSurfaceRequired" } : {}),
    ...(!surfaceAvailable ? { unavailableReason: "surfaceUnavailable" } : {}),
  };
}

function encoderControlView(
  id: string,
  index: number,
  offers: SandalphonSnapshot["sessions"][number]["actionOffers"],
  surfaceAvailable: boolean,
): ControlView {
  const choiceOffers = offers.filter(
    ({ kind }) => kind === "ChangeNextTurnOptions",
  );
  const offer = choiceOffers[index];
  if (!offer) return { id, role: "empty", enabled: false, label: "" };
  return {
    id,
    role: "choice",
    enabled: offer.state === "available" && surfaceAvailable,
    label: offer.kind,
    ...(offer.offerToken && surfaceAvailable
      ? { offerToken: offer.offerToken }
      : {}),
    ...(offer.optionIds ? { optionIds: offer.optionIds } : {}),
    actionKind: offer.kind,
    ...(!surfaceAvailable ? { unavailableReason: "surfaceUnavailable" } : {}),
  };
}
