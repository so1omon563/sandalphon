import {
  evaluateDesktopControl,
  revokeDesktopControl,
  type DesktopControlObservation,
  type DesktopControlPolicy,
  type DesktopControlState,
} from "./desktopControlContract.js";

export const DESKTOP_COMPANION_PROTOCOL_VERSION = 1 as const;

export type DesktopCompanionLifecycle =
  | "stopped"
  | "starting"
  | "ready"
  | "degraded"
  | "cleaningUp"
  | "recoveryRequired";

export type DesktopCompanionFailure =
  | "startupReconciliationRequired"
  | "startFailed"
  | "startTimedOut"
  | "startUnfenced"
  | "capabilityRejected"
  | "capabilityLost"
  | "cleanupFailed"
  | "cleanupTimedOut"
  | "cleanupUnfenced"
  | "recoveryAmbiguous"
  | "reconcileFailed"
  | "reconcileTimedOut"
  | "reconcileUnfenced";

export interface DesktopCompanionSnapshot {
  readonly protocolVersion: typeof DESKTOP_COMPANION_PROTOCOL_VERSION;
  readonly lifecycle: DesktopCompanionLifecycle;
  readonly sequence: number;
  readonly desktop: DesktopControlState;
  readonly failure?: DesktopCompanionFailure;
}

export type DesktopCompanionRecovery =
  | { readonly kind: "normal" }
  | {
      readonly kind: "controlled";
      readonly observation: DesktopControlObservation;
    }
  | { readonly kind: "ambiguous" };

export interface DesktopCompanionDriver {
  startControlled(signal: AbortSignal): Promise<DesktopControlObservation>;
  reconcileControlled(signal: AbortSignal): Promise<DesktopCompanionRecovery>;
  cleanupControlled(signal: AbortSignal): Promise<void>;
}

export interface DesktopCompanionTimeouts {
  readonly startMs: number;
  readonly reconcileMs: number;
  readonly cleanupMs: number;
  readonly abortGraceMs: number;
}

export type DesktopCompanionMethod = "status" | "start" | "stop" | "recover";

export interface DesktopCompanionRequest {
  readonly protocolVersion: typeof DESKTOP_COMPANION_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly method: DesktopCompanionMethod;
}

export interface DesktopCompanionResponse {
  readonly protocolVersion: typeof DESKTOP_COMPANION_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly ok: true;
  readonly snapshot: DesktopCompanionSnapshot;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/u;
const METHODS = new Set<DesktopCompanionMethod>([
  "status",
  "start",
  "stop",
  "recover",
]);
const DEFAULT_TIMEOUTS: DesktopCompanionTimeouts = Object.freeze({
  startMs: 30_000,
  reconcileMs: 10_000,
  cleanupMs: 30_000,
  abortGraceMs: 1_000,
});

class DriverTimeoutError extends Error {}
class DriverUnfencedError extends Error {}

export class DesktopCompanionSupervisor {
  readonly #driver: DesktopCompanionDriver;
  readonly #policy: DesktopControlPolicy;
  readonly #timeouts: DesktopCompanionTimeouts;
  #snapshot: DesktopCompanionSnapshot = {
    protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
    lifecycle: "recoveryRequired",
    sequence: 0,
    desktop: disconnectedDesktopState(0, 0),
    failure: "startupReconciliationRequired",
  };
  #cleanupAuthorized = false;
  #operationUnfenced = false;
  #tail: Promise<void> = Promise.resolve();

  constructor(
    driver: DesktopCompanionDriver,
    policy: DesktopControlPolicy,
    timeouts: DesktopCompanionTimeouts = DEFAULT_TIMEOUTS,
  ) {
    this.#driver = driver;
    this.#policy = policy;
    this.#timeouts = timeouts;
  }

  status(): DesktopCompanionSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  start(): Promise<DesktopCompanionSnapshot> {
    return this.#enqueue(async () => {
      if (this.#snapshot.lifecycle !== "stopped") return this.status();
      this.#cleanupAuthorized = true;
      this.#transition("starting");
      let observation: DesktopControlObservation;
      try {
        observation = await withDeadline(
          this.#timeouts.startMs,
          this.#timeouts.abortGraceMs,
          (signal) => this.#driver.startControlled(signal),
        );
      } catch (error) {
        if (error instanceof DriverUnfencedError) {
          this.#cleanupAuthorized = false;
          this.#operationUnfenced = true;
          this.#transition(
            "recoveryRequired",
            "startUnfenced",
            revoked(this.#snapshot.desktop),
          );
          return this.status();
        }
        await this.#failAndClean(
          error instanceof DriverTimeoutError ? "startTimedOut" : "startFailed",
        );
        return this.status();
      }
      await this.#acceptObservationOrClean(observation);
      return this.status();
    });
  }

  stop(): Promise<DesktopCompanionSnapshot> {
    return this.#enqueue(async () => {
      if (this.#snapshot.lifecycle === "stopped" || !this.#cleanupAuthorized) {
        return this.status();
      }
      await this.#clean();
      return this.status();
    });
  }

  recover(): Promise<DesktopCompanionSnapshot> {
    return this.#enqueue(async () => {
      if (
        this.#operationUnfenced ||
        (this.#snapshot.lifecycle !== "stopped" &&
          this.#snapshot.lifecycle !== "recoveryRequired")
      ) {
        return this.status();
      }
      this.#cleanupAuthorized = false;
      this.#transition("starting");
      let recovery: DesktopCompanionRecovery;
      try {
        recovery = await withDeadline(
          this.#timeouts.reconcileMs,
          this.#timeouts.abortGraceMs,
          (signal) => this.#driver.reconcileControlled(signal),
        );
      } catch (error) {
        if (error instanceof DriverUnfencedError) {
          this.#operationUnfenced = true;
        }
        this.#transition(
          "recoveryRequired",
          error instanceof DriverUnfencedError
            ? "reconcileUnfenced"
            : error instanceof DriverTimeoutError
              ? "reconcileTimedOut"
              : "reconcileFailed",
        );
        return this.status();
      }
      if (recovery.kind === "normal") {
        this.#cleanupAuthorized = false;
        this.#transition("stopped", undefined, revoked(this.#snapshot.desktop));
        return this.status();
      }
      if (recovery.kind === "ambiguous") {
        this.#cleanupAuthorized = false;
        this.#transition("recoveryRequired", "recoveryAmbiguous");
        return this.status();
      }
      this.#cleanupAuthorized = true;
      await this.#acceptObservationOrClean(recovery.observation);
      return this.status();
    });
  }

  capabilityLost(): DesktopCompanionSnapshot {
    if (this.#snapshot.lifecycle === "ready") {
      this.#transition(
        "degraded",
        "capabilityLost",
        revoked(this.#snapshot.desktop),
      );
    }
    return this.status();
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #acceptObservationOrClean(
    observation: DesktopControlObservation,
  ): Promise<void> {
    const desktop = evaluateDesktopControl(this.#policy, observation);
    if (desktop.availability === "ready") {
      this.#transition("ready", undefined, desktop);
      return;
    }
    await this.#failAndClean("capabilityRejected");
  }

  async #failAndClean(failure: DesktopCompanionFailure): Promise<void> {
    this.#transition("degraded", failure, revoked(this.#snapshot.desktop));
    await this.#clean(failure);
  }

  async #clean(priorFailure?: DesktopCompanionFailure): Promise<void> {
    this.#transition(
      "cleaningUp",
      priorFailure,
      revoked(this.#snapshot.desktop),
    );
    try {
      await withDeadline(
        this.#timeouts.cleanupMs,
        this.#timeouts.abortGraceMs,
        (signal) => this.#driver.cleanupControlled(signal),
      );
      this.#cleanupAuthorized = false;
      this.#transition(
        "stopped",
        priorFailure,
        revoked(this.#snapshot.desktop),
      );
    } catch (error) {
      if (error instanceof DriverUnfencedError) {
        this.#cleanupAuthorized = false;
        this.#operationUnfenced = true;
      }
      this.#transition(
        "recoveryRequired",
        error instanceof DriverUnfencedError
          ? "cleanupUnfenced"
          : error instanceof DriverTimeoutError
            ? "cleanupTimedOut"
            : "cleanupFailed",
        revoked(this.#snapshot.desktop),
      );
    }
  }

  #transition(
    lifecycle: DesktopCompanionLifecycle,
    failure?: DesktopCompanionFailure,
    desktop: DesktopControlState = this.#snapshot.desktop,
  ): void {
    this.#snapshot = {
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      lifecycle,
      sequence: this.#snapshot.sequence + 1,
      desktop,
      ...(failure ? { failure } : {}),
    };
  }
}

export function parseDesktopCompanionRequest(
  value: unknown,
): DesktopCompanionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalidRequest");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    record.protocolVersion !== DESKTOP_COMPANION_PROTOCOL_VERSION ||
    typeof record.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(record.requestId) ||
    typeof record.method !== "string" ||
    !METHODS.has(record.method as DesktopCompanionMethod)
  ) {
    throw new Error("invalidRequest");
  }
  return {
    protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
    requestId: record.requestId,
    method: record.method as DesktopCompanionMethod,
  };
}

export async function handleDesktopCompanionRequest(
  supervisor: DesktopCompanionSupervisor,
  request: DesktopCompanionRequest,
): Promise<DesktopCompanionResponse> {
  let snapshot: DesktopCompanionSnapshot;
  switch (request.method) {
    case "status":
      snapshot = supervisor.status();
      break;
    case "start":
      snapshot = await supervisor.start();
      break;
    case "stop":
      snapshot = await supervisor.stop();
      break;
    case "recover":
      snapshot = await supervisor.recover();
      break;
  }
  return {
    protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: true,
    snapshot,
  };
}

function disconnectedDesktopState(
  epoch: number,
  revision: number,
): DesktopControlState {
  return {
    availability: "unavailable",
    reason: "disconnected",
    epoch,
    revision,
    targets: [],
  };
}

function revoked(state: DesktopControlState): DesktopControlState {
  return revokeDesktopControl(state);
}

function cloneSnapshot(
  snapshot: DesktopCompanionSnapshot,
): DesktopCompanionSnapshot {
  const desktop =
    snapshot.desktop.availability === "ready"
      ? {
          ...snapshot.desktop,
          targets: snapshot.desktop.targets.map((target) => ({ ...target })),
        }
      : { ...snapshot.desktop, targets: [] as const };
  return {
    ...snapshot,
    desktop,
  };
}

async function withDeadline<T>(
  timeoutMs: number,
  abortGraceMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const outcome = Promise.resolve()
    .then(() => operation(controller.signal))
    .then<DriverOutcome<T>, DriverOutcome<T>>(
      (value) => ({ kind: "success", value }),
      (error: unknown) => ({ kind: "failure", error }),
    );
  try {
    const first = await Promise.race([
      outcome,
      new Promise<DriverDeadline>((resolve) => {
        deadlineTimer = setTimeout(
          () => resolve({ kind: "deadline" }),
          timeoutMs,
        );
      }),
    ]);
    if (first.kind === "success") return first.value;
    if (first.kind === "failure") throw first.error;

    controller.abort();
    const fenced = await Promise.race([
      outcome,
      new Promise<DriverUnfenced>((resolve) => {
        graceTimer = setTimeout(
          () => resolve({ kind: "unfenced" }),
          abortGraceMs,
        );
      }),
    ]);
    if (fenced.kind === "unfenced") throw new DriverUnfencedError();
    throw new DriverTimeoutError();
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (graceTimer) clearTimeout(graceTimer);
  }
}

type DriverOutcome<T> =
  | { readonly kind: "success"; readonly value: T }
  | { readonly kind: "failure"; readonly error: unknown };
type DriverDeadline = { readonly kind: "deadline" };
type DriverUnfenced = { readonly kind: "unfenced" };
