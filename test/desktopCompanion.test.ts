import { describe, expect, it } from "vitest";

import {
  DESKTOP_COMPANION_PROTOCOL_VERSION,
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
  allowedVersions: [
    {
      application: "26.715.52143",
      engine: "150.0.7871.124",
      protocol: "1.3",
    },
  ],
};

const observation: DesktopControlObservation = {
  connected: true,
  endpointHost: "127.0.0.1",
  epoch: 3,
  revision: 5,
  version: policy.allowedVersions[0]!,
  capabilities: ["task.list", "task.select"],
  targets: [
    { id: "opaque-1", selected: true },
    { id: "opaque-2", selected: false },
  ],
};

class FakeDriver implements DesktopCompanionDriver {
  cleanupError = false;
  cleanupCount = 0;
  recovery: DesktopCompanionRecovery = { kind: "normal" };
  startError = false;
  startObservation: DesktopControlObservation = observation;

  startControlled(): Promise<DesktopControlObservation> {
    return this.startError
      ? Promise.reject(new Error("private detail"))
      : Promise.resolve(this.startObservation);
  }

  reconcileControlled(): Promise<DesktopCompanionRecovery> {
    return Promise.resolve(this.recovery);
  }

  cleanupControlled(): Promise<void> {
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
    const snapshot = await new DesktopCompanionSupervisor(
      driver,
      policy,
    ).start();
    expect(snapshot).toMatchObject({
      lifecycle: "stopped",
      failure: "startFailed",
      desktop: { availability: "unavailable", targets: [] },
    });
    expect(driver.cleanupCount).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain("private detail");
  });

  it("turns a wedged start into bounded cleanup", async () => {
    const driver = new FakeDriver();
    driver.startControlled = () => new Promise(() => undefined);
    const snapshot = await new DesktopCompanionSupervisor(driver, policy, {
      startMs: 1,
      reconcileMs: 1,
      cleanupMs: 1,
    }).start();
    expect(snapshot).toMatchObject({
      lifecycle: "stopped",
      failure: "startTimedOut",
    });
    expect(driver.cleanupCount).toBe(1);
  });

  it("keeps cleanup timeouts in explicit recovery", async () => {
    const driver = new FakeDriver();
    driver.cleanupControlled = () => new Promise(() => undefined);
    const supervisor = new DesktopCompanionSupervisor(driver, policy, {
      startMs: 10,
      reconcileMs: 10,
      cleanupMs: 1,
    });
    await supervisor.start();
    expect(await supervisor.stop()).toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "cleanupTimedOut",
      desktop: { availability: "unavailable", targets: [] },
    });
  });

  it("bounds restart reconciliation without guessing", async () => {
    const driver = new FakeDriver();
    driver.reconcileControlled = () => new Promise(() => undefined);
    const snapshot = await new DesktopCompanionSupervisor(driver, policy, {
      startMs: 10,
      reconcileMs: 1,
      cleanupMs: 10,
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
    const snapshot = await new DesktopCompanionSupervisor(
      driver,
      policy,
    ).start();
    expect(snapshot).toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "cleanupFailed",
      desktop: { availability: "unavailable", targets: [] },
    });
  });

  it("reattaches only to a reconciled controlled renderer", async () => {
    const driver = new FakeDriver();
    driver.recovery = { kind: "controlled", observation };
    const supervisor = new DesktopCompanionSupervisor(driver, policy);
    expect(await supervisor.recover()).toMatchObject({ lifecycle: "ready" });
    expect(supervisor.capabilityLost()).toMatchObject({
      lifecycle: "degraded",
      failure: "capabilityLost",
      desktop: { availability: "unavailable", targets: [] },
    });
    expect(await supervisor.stop()).toMatchObject({ lifecycle: "stopped" });
  });

  it("does not guess when recovery ownership is ambiguous", async () => {
    const driver = new FakeDriver();
    driver.recovery = { kind: "ambiguous" };
    const snapshot = await new DesktopCompanionSupervisor(
      driver,
      policy,
    ).recover();
    expect(snapshot).toMatchObject({
      lifecycle: "recoveryRequired",
      failure: "recoveryAmbiguous",
    });
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
      snapshot: { lifecycle: "stopped" },
    });
    for (const invalid of [
      null,
      {},
      { ...request, protocolVersion: 2 },
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
