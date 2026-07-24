import { describe, expect, it } from "vitest";

import {
  MACOS_CONTROL_RECORD_SCHEMA,
  MACOS_DESKTOP_CONTROL_VERSION,
  MacosDesktopCompanionDriver,
  controlledLaunchArguments,
  parseMacosControlledLaunchRecord,
  type MacosControlledLaunchRecord,
  type MacosControlledProcess,
  type MacosDesktopCompanionPlatform,
} from "../src/macosDesktopCompanionDriver.js";
import type { DesktopControlObservation } from "../src/desktopControlContract.js";

const CONTROL_ID = "11111111-1111-4111-8111-111111111111";
const PROCESS: MacosControlledProcess = {
  pid: 4242,
  startedAt: "Thu Jul 24 11:00:00 2026",
};

class FakePlatform implements MacosDesktopCompanionPlatform {
  applicationVersion = MACOS_DESKTOP_CONTROL_VERSION.application;
  controlled: MacosControlledProcess[] = [];
  deleted = 0;
  launchedNormal = 0;
  normalCount = 1;
  owner: number | undefined;
  record: unknown;
  stoppedNormal = 0;
  terminated = 0;
  unownedControlled: MacosControlledProcess[] = [];
  writes: MacosControlledLaunchRecord[] = [];

  readApplicationVersion(): Promise<string> {
    return Promise.resolve(this.applicationVersion);
  }
  readLaunchRecord(): Promise<unknown> {
    return Promise.resolve(this.record);
  }
  writeLaunchRecord(record: MacosControlledLaunchRecord): Promise<void> {
    this.record = record;
    this.writes.push(record);
    return Promise.resolve();
  }
  deleteLaunchRecord(): Promise<void> {
    this.record = undefined;
    this.deleted += 1;
    return Promise.resolve();
  }
  allocateLoopbackPort(): Promise<number> {
    return Promise.resolve(49152);
  }
  launchControlled(): Promise<MacosControlledProcess> {
    this.controlled = [PROCESS];
    this.owner = PROCESS.pid;
    return Promise.resolve(PROCESS);
  }
  findControlledProcesses(
    controlId: string | undefined,
  ): Promise<readonly MacosControlledProcess[]> {
    return Promise.resolve(
      controlId === undefined
        ? [...this.controlled, ...this.unownedControlled]
        : this.controlled,
    );
  }
  listenerOwner(): Promise<number | undefined> {
    return Promise.resolve(this.owner);
  }
  observeDesktop(): Promise<
    Omit<DesktopControlObservation, "epoch" | "revision">
  > {
    return Promise.resolve({
      connected: true,
      endpointHost: "127.0.0.1",
      version: MACOS_DESKTOP_CONTROL_VERSION,
      capabilities: ["task.list", "task.select"],
      targets: [{ id: "opaque", selected: true }],
    });
  }
  terminateControlled(): Promise<void> {
    this.controlled = [];
    this.owner = undefined;
    this.terminated += 1;
    return Promise.resolve();
  }
  stopNormal(): Promise<void> {
    this.stoppedNormal += 1;
    this.normalCount = 0;
    return Promise.resolve();
  }
  launchNormal(): Promise<void> {
    this.launchedNormal += 1;
    this.normalCount = 1;
    return Promise.resolve();
  }
  normalProcessCount(): Promise<number> {
    return Promise.resolve(this.normalCount);
  }
}

function driver(platform: FakePlatform): MacosDesktopCompanionDriver {
  return new MacosDesktopCompanionDriver(platform, {
    createControlId: () => CONTROL_ID,
    createEpoch: () => 7,
  });
}

describe("macOS desktop companion driver", () => {
  it("persists launch intent before starting and admits only owned observation", async () => {
    const platform = new FakePlatform();
    const observation = await driver(platform).startControlled(
      new AbortController().signal,
    );
    expect(platform.writes.map(({ phase }) => phase)).toEqual([
      "launching",
      "controlled",
      "controlled",
    ]);
    expect(platform.writes[0]).not.toHaveProperty("process");
    expect(platform.stoppedNormal).toBe(1);
    expect(observation).toMatchObject({
      endpointHost: "127.0.0.1",
      epoch: 7,
      revision: 1,
      targets: [{ id: "opaque", selected: true }],
    });
  });

  it("rejects version drift before creating launch state", async () => {
    const platform = new FakePlatform();
    platform.applicationVersion = "newer";
    await expect(
      driver(platform).startControlled(new AbortController().signal),
    ).rejects.toThrow("unsupportedApplicationVersion");
    expect(platform.writes).toEqual([]);
    await expect(
      driver(platform).reconcileControlled(new AbortController().signal),
    ).resolves.toEqual({ kind: "normal" });
  });

  it("reattaches only to the exact recorded process and listener", async () => {
    const platform = new FakePlatform();
    platform.applicationVersion = "newer-on-disk";
    platform.record = record(PROCESS);
    platform.controlled = [PROCESS];
    platform.owner = PROCESS.pid;
    await expect(
      driver(platform).reconcileControlled(new AbortController().signal),
    ).resolves.toMatchObject({
      kind: "controlled",
      observation: { epoch: 7, revision: 1 },
    });

    platform.owner = 9999;
    await expect(
      driver(platform).reconcileControlled(new AbortController().signal),
    ).resolves.toEqual({ kind: "ambiguous" });
  });

  it("clears a stale record only when no process or listener remains", async () => {
    const platform = new FakePlatform();
    platform.record = record(PROCESS);
    await expect(
      driver(platform).reconcileControlled(new AbortController().signal),
    ).resolves.toEqual({ kind: "normal" });
    expect(platform.deleted).toBe(1);
    expect(platform.launchedNormal).toBe(0);

    platform.record = record(PROCESS);
    platform.normalCount = 0;
    await expect(
      driver(platform).reconcileControlled(new AbortController().signal),
    ).resolves.toEqual({ kind: "normal" });
    expect(platform.launchedNormal).toBe(1);

    platform.record = record(PROCESS);
    platform.owner = 9000;
    await expect(
      driver(platform).reconcileControlled(new AbortController().signal),
    ).resolves.toEqual({ kind: "ambiguous" });
    expect(platform.deleted).toBe(2);
  });

  it("rejects unrecorded controlled processes during reconciliation and cleanup", async () => {
    const platform = new FakePlatform();
    platform.controlled = [PROCESS];
    await expect(
      driver(platform).reconcileControlled(new AbortController().signal),
    ).resolves.toEqual({ kind: "ambiguous" });
    await expect(
      driver(platform).cleanupControlled(new AbortController().signal),
    ).rejects.toThrow("unownedControlledProcess");
  });

  it("refuses to reconcile or clean while an additional controlled process is unowned", async () => {
    const platform = new FakePlatform();
    platform.record = record(PROCESS);
    platform.controlled = [PROCESS];
    platform.unownedControlled = [
      { pid: 4343, startedAt: "Thu Jul 24 11:01:00 2026" },
    ];
    platform.owner = PROCESS.pid;
    await expect(
      driver(platform).reconcileControlled(new AbortController().signal),
    ).resolves.toEqual({ kind: "ambiguous" });
    await expect(
      driver(platform).cleanupControlled(new AbortController().signal),
    ).rejects.toThrow("unownedControlledProcess");
    expect(platform.terminated).toBe(0);
  });

  it("restores normal Codex when an explicit start fails before a process record exists", async () => {
    const platform = new FakePlatform();
    platform.normalCount = 0;
    await driver(platform).cleanupControlled(new AbortController().signal);
    expect(platform.launchedNormal).toBe(1);
  });

  it("terminates only the recorded process, closes its listener, and restores normal Codex", async () => {
    const platform = new FakePlatform();
    platform.record = record(PROCESS);
    platform.controlled = [PROCESS];
    platform.owner = PROCESS.pid;
    platform.normalCount = 0;
    await driver(platform).cleanupControlled(new AbortController().signal);
    expect(platform.terminated).toBe(1);
    expect(platform.deleted).toBe(1);
    expect(platform.launchedNormal).toBe(1);
  });

  it("fails closed when the listener owner differs from the controlled process", async () => {
    const platform = new FakePlatform();
    platform.record = record(PROCESS);
    platform.controlled = [PROCESS];
    platform.owner = 9999;
    await expect(
      driver(platform).cleanupControlled(new AbortController().signal),
    ).rejects.toThrow("listenerOwnershipChanged");
    expect(platform.terminated).toBe(0);
    expect(platform.deleted).toBe(0);
  });

  it("detects capability or ownership loss during monitoring", async () => {
    const platform = new FakePlatform();
    platform.record = record(PROCESS);
    platform.controlled = [PROCESS];
    platform.owner = PROCESS.pid;
    await expect(
      driver(platform).verifyControlled(new AbortController().signal),
    ).resolves.toBeUndefined();
    platform.owner = undefined;
    await expect(
      driver(platform).verifyControlled(new AbortController().signal),
    ).rejects.toThrow("listenerOwnershipChanged");
  });

  it("strictly validates durable records and builds bounded launch arguments", () => {
    const value = record(PROCESS);
    expect(parseMacosControlledLaunchRecord(value)).toEqual(value);
    expect(controlledLaunchArguments(value)).toEqual([
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=49152",
      `--sandalphon-control-id=${CONTROL_ID}`,
    ]);
    for (const invalid of [
      null,
      {},
      { ...value, schema: 2 },
      { ...value, applicationVersion: "not-a-version" },
      { ...value, controlId: "bad" },
      { ...value, port: 0 },
      { ...value, extra: true },
      { ...value, phase: "controlled", process: undefined },
      { ...value, phase: "launching" },
      { ...value, process: { pid: 0, startedAt: "" } },
      { ...value, process: { ...PROCESS, extra: true } },
    ]) {
      expect(() => parseMacosControlledLaunchRecord(invalid)).toThrow(
        "invalidControlledRecord",
      );
    }
  });
});

function record(process?: MacosControlledProcess): MacosControlledLaunchRecord {
  return {
    schema: MACOS_CONTROL_RECORD_SCHEMA,
    phase: process ? "controlled" : "launching",
    applicationVersion: MACOS_DESKTOP_CONTROL_VERSION.application,
    controlId: CONTROL_ID,
    port: 49152,
    epoch: 7,
    revision: 0,
    ...(process ? { process } : {}),
  };
}
