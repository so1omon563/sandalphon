import { describe, expect, it } from "vitest";

import {
  DESKTOP_COMPANION_PROTOCOL_VERSION,
  DesktopCompanionStartError,
  DesktopCompanionSupervisor,
  handleDesktopCompanionRequest,
  parseDesktopCompanionRequest,
  type DesktopCompanionDriver,
  type DesktopCompanionRecovery,
} from "../src/desktopCompanion.js";
import type {
  DesktopControlObservation,
  DesktopControlPolicy,
} from "../src/desktopControlContract.js";

const policy: DesktopControlPolicy = {
  enabled: true,
  allowedContractRevisions: [1],
};

const observation: DesktopControlObservation = {
  connected: true,
  endpointHost: "127.0.0.1",
  epoch: 3,
  revision: 5,
  contractRevision: 1,
  version: {
    application: "26.721.41059",
    engine: "150.0.7871.124",
    protocol: "1.3",
  },
  capabilities: ["task.list", "task.select"],
  targets: [
    { id: "opaque-1", selected: true },
    { id: "opaque-2", selected: false },
  ],
};

class FakeDriver implements DesktopCompanionDriver {
  cleanupError = false;
  cleanupCount = 0;
  reconcileCount = 0;
  recovery: DesktopCompanionRecovery = { kind: "normal" };
  startError = false;
  startDiagnostics:
    | {
        readonly rendererTargetCount?: number;
        readonly rendererPageCount?: number;
      }
    | undefined;
  startFailure: DesktopCompanionStartError["failure"] | undefined;
  startCount = 0;
  startObservation: DesktopControlObservation = observation;

  startControlled(signal: AbortSignal): Promise<DesktopControlObservation> {
    void signal;
    this.startCount += 1;
    return this.startFailure
      ? Promise.reject(
          new DesktopCompanionStartError(
            this.startFailure,
            this.startDiagnostics,
          ),
        )
      : this.startError
        ? Promise.reject(new Error("private detail"))
        : Promise.resolve(this.startObservation);
  }

  reconcileControlled(signal: AbortSignal): Promise<DesktopCompanionRecovery> {
    void signal;
    this.reconcileCount += 1;
    return Promise.resolve(this.recovery);
  }

  cleanupControlled(signal: AbortSignal): Promise<void> {
    void signal;
    this.cleanupCount += 1;
    return this.cleanupError
      ? Promise.reject(new Error("private detail"))
      : Promise.resolve();
  }
}

describe("desktop companion supervisor", () => {
  it("starts only after the exact desktop contract becomes ready", async () => {
    const driver = new FakeDriver();
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    expect(supervisor.status()).toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "startupReconciliationRequired",
    });
    expect(await supervisor.start()).toMatchObject({
      lifecycle: "recoveryRequired",
    });
    expect(driver.startCount).toBe(0);
    expect(await supervisor.recover()).toMatchObject({ lifecycle: "stopped" });
    const snapshot = await supervisor.start();
    expect(snapshot).toMatchObject({
      lifecycle: "ready",
      desktop: {
        availability: "ready",
        selectedTargetId: "opaque-1",
      },
    });
    expect(await supervisor.start()).toEqual(snapshot);
  });

  it("serializes lifecycle requests from independent clients", async () => {
    let releaseStart!: (value: DesktopControlObservation) => void;
    const pendingStart = new Promise<DesktopControlObservation>((resolve) => {
      releaseStart = resolve;
    });
    const driver = new FakeDriver();
    driver.startControlled = () => pendingStart;
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    await supervisor.recover();
    const starting = supervisor.start();
    const stopping = supervisor.stop();
    await Promise.resolve();
    expect(supervisor.status().lifecycle).toBe("starting");
    releaseStart(observation);
    await expect(starting).resolves.toMatchObject({ lifecycle: "ready" });
    await expect(stopping).resolves.toMatchObject({ lifecycle: "stopped" });
    expect(driver.cleanupCount).toBe(1);
  });

  it("cleans a failed start without exposing driver errors", async () => {
    const driver = new FakeDriver();
    driver.startError = true;
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    await supervisor.recover();
    const snapshot = await supervisor.start();
    expect(snapshot).toMatchObject({
      lifecycle: "stopped",
      failure: "startFailed",
      desktop: { availability: "unavailable", targets: [] },
    });
    expect(driver.cleanupCount).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain("private detail");
  });

  it("retains a bounded content-free start failure category", async () => {
    const driver = new FakeDriver();
    driver.startFailure = "applicationRejected";
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    await supervisor.recover();
    await expect(supervisor.start()).resolves.toMatchObject({
      lifecycle: "stopped",
      failure: "applicationRejected",
      desktop: { availability: "unavailable", targets: [] },
    });
    expect(driver.cleanupCount).toBe(1);
  });

  it("turns a wedged start into bounded cleanup", async () => {
    const driver = new FakeDriver();
    driver.startControlled = (
      signal: AbortSignal,
    ): Promise<DesktopControlObservation> =>
      new Promise<DesktopControlObservation>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    const supervisor = new DesktopCompanionSupervisor(driver, policy, {
      startMs: 1,
      reconcileMs: 1,
      cleanupMs: 1,
      abortGraceMs: 10,
    });
    await supervisor.recover();
    const snapshot = await supervisor.start();
    expect(snapshot).toMatchObject({
      lifecycle: "stopped",
      failure: "startTimedOut",
    });
    expect(driver.cleanupCount).toBe(1);
  });

  it("does not clean or stop while a timed-out start remains unfenced", async () => {
    const driver = new FakeDriver();
    let completeStart!: (value: DesktopControlObservation) => void;
    driver.startControlled = () =>
      new Promise((resolve) => {
        completeStart = resolve;
      });
    const supervisor = new DesktopCompanionSupervisor(driver, policy, {
      startMs: 1,
      reconcileMs: 10,
      cleanupMs: 10,
      abortGraceMs: 1,
    });
    await supervisor.recover();
    const snapshot = await supervisor.start();
    expect(snapshot).toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "startUnfenced",
    });
    expect(driver.cleanupCount).toBe(0);
    expect(await supervisor.stop()).toEqual(snapshot);
    expect(await supervisor.recover()).toEqual(snapshot);
    expect(driver.reconcileCount).toBe(1);
    completeStart(observation);
    await Promise.resolve();
    expect(supervisor.status()).toEqual(snapshot);
  });

  it("keeps cleanup timeouts in explicit recovery", async () => {
    const driver = new FakeDriver();
    driver.cleanupControlled = (signal: AbortSignal): Promise<void> =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    const supervisor = new DesktopCompanionSupervisor(driver, policy, {
      startMs: 10,
      reconcileMs: 10,
      cleanupMs: 1,
      abortGraceMs: 10,
    });
    await supervisor.recover();
    await supervisor.start();
    expect(await supervisor.stop()).toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "cleanupTimedOut",
      desktop: { availability: "unavailable", targets: [] },
    });
  });

  it("bounds restart reconciliation without guessing", async () => {
    const driver = new FakeDriver();
    driver.reconcileControlled = (
      signal: AbortSignal,
    ): Promise<DesktopCompanionRecovery> =>
      new Promise<DesktopCompanionRecovery>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    const snapshot = await new DesktopCompanionSupervisor(driver, policy, {
      startMs: 10,
      reconcileMs: 1,
      cleanupMs: 10,
      abortGraceMs: 10,
    }).recover();
    expect(snapshot).toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "reconcileTimedOut",
    });
    expect(driver.cleanupCount).toBe(0);
  });

  it("fails closed and requires recovery when cleanup fails", async () => {
    const driver = new FakeDriver();
    driver.startObservation = {
      ...observation,
      endpointHost: "0.0.0.0",
    };
    driver.cleanupError = true;
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    await supervisor.recover();
    const snapshot = await supervisor.start();
    expect(snapshot).toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "cleanupFailed",
      priorFailure: "capabilityRejected",
      desktop: { availability: "unavailable", targets: [] },
    });
  });

  it("preserves the start diagnostic when cleanup also fails", async () => {
    const driver = new FakeDriver();
    driver.startFailure = "rendererTargetsOverLimit";
    driver.startDiagnostics = { rendererTargetCount: 97 };
    driver.cleanupError = true;
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    await supervisor.recover();
    await expect(supervisor.start()).resolves.toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "cleanupFailed",
      priorFailure: "rendererTargetsOverLimit",
      diagnostics: { rendererTargetCount: 97 },
    });
  });

  it("preserves a canonical renderer-page count through cleanup", async () => {
    const driver = new FakeDriver();
    driver.startFailure = "rendererPagesAmbiguous";
    driver.startDiagnostics = { rendererPageCount: 2 };
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    await supervisor.recover();
    await expect(supervisor.start()).resolves.toMatchObject({
      lifecycle: "stopped",
      failure: "rendererPagesAmbiguous",
      diagnostics: { rendererPageCount: 2 },
    });
  });

  it("reattaches only to a reconciled controlled renderer", async () => {
    const driver = new FakeDriver();
    driver.recovery = { kind: "controlled", observation };
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    expect(await supervisor.recover()).toMatchObject({ lifecycle: "ready" });
    expect(await supervisor.capabilityLost()).toMatchObject({
      lifecycle: "stopped",
      failure: "capabilityLost",
      desktop: { availability: "unavailable", targets: [] },
    });
    expect(driver.cleanupCount).toBe(1);
  });

  it("does not guess when recovery ownership is ambiguous", async () => {
    const driver = new FakeDriver();
    driver.recovery = { kind: "ambiguous" };
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    const snapshot = await supervisor.recover();
    expect(snapshot).toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "recoveryAmbiguous",
    });
    expect(await supervisor.stop()).toEqual(snapshot);
    expect(driver.cleanupCount).toBe(0);
  });

  it("uses a strict content-free IPC request envelope", async () => {
    const request = parseDesktopCompanionRequest({
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      requestId: "request-1",
      method: "status",
    });
    const response = await handleDesktopCompanionRequest(
      new DesktopCompanionSupervisor(new FakeDriver(), policy),
      request,
    );
    expect(response).toMatchObject({
      protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
      requestId: "request-1",
      ok: true,
      snapshot: {
        lifecycle: "recoveryRequired",
        failure: "startupReconciliationRequired",
      },
    });
    for (const invalid of [
      null,
      {},
      { ...request, protocolVersion: 4 },
      { ...request, requestId: "contains spaces" },
      { ...request, method: "select", targetId: "leaked" },
      { ...request, extra: true },
    ]) {
      expect(() => parseDesktopCompanionRequest(invalid)).toThrow(
        "invalidRequest",
      );
    }
  });
});
