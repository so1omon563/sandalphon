import { describe, expect, it } from "vitest";

import {
  MACOS_COMPATIBILITY_RECEIPT_SCHEMA,
  MACOS_CONTROL_RECORD_SCHEMA,
  MACOS_DESKTOP_CONTROL_CONTRACT_REVISION,
  MacosDesktopTargetCountError,
  MacosDesktopCompanionDriver,
  controlledLaunchArguments,
  parseMacosControlledLaunchRecord,
  parseMacosDesktopCompatibilityReceipt,
  type MacosCodexApplicationIdentity,
  type MacosControlledLaunchRecord,
  type MacosControlledProcess,
  type MacosDesktopCompanionPlatform,
  type MacosDesktopCompatibilityReceipt,
} from "../src/macosDesktopCompanionDriver.js";
import type { DesktopControlObservation } from "../src/desktopControlContract.js";

const CONTROL_ID = "11111111-1111-4111-8111-111111111111";
const PROCESS: MacosControlledProcess = {
  pid: 4242,
  startedAt: "Thu Jul 24 11:00:00 2026",
};
const IDENTITY: MacosCodexApplicationIdentity = {
  applicationVersion: "26.721.41059",
  bundleVersion: "5848",
  bundleIdentifier: "com.openai.codex",
  teamIdentifier: "2DC432GLL2",
  cdHash: "753af97d4310c3c393348bdc0f28794e51b096ed",
};
const VERSION = {
  application: IDENTITY.applicationVersion,
  engine: "150.0.7871.124",
  protocol: "1.3",
} as const;
const RECEIPT: MacosDesktopCompatibilityReceipt = {
  schema: MACOS_COMPATIBILITY_RECEIPT_SCHEMA,
  contractRevision: MACOS_DESKTOP_CONTROL_CONTRACT_REVISION,
  identity: IDENTITY,
  engine: VERSION.engine,
  protocol: "1.3",
};

class FakePlatform implements MacosDesktopCompanionPlatform {
  claimListenerOnLaunch = true;
  identity = IDENTITY;
  identityError = false;
  receipt: unknown = RECEIPT;
  receiptWrites: MacosDesktopCompatibilityReceipt[] = [];
  selectedId = "opaque-1";
  selections: string[] = [];
  controlled: MacosControlledProcess[] = [];
  deleted = 0;
  launchedNormal = 0;
  normalCount = 1;
  observeError: Error | string | undefined;
  owner: number | undefined;
  record: unknown;
  stoppedNormal = 0;
  terminated = 0;
  unownedControlled: MacosControlledProcess[] = [];
  writes: MacosControlledLaunchRecord[] = [];

  readApplicationIdentity(): Promise<MacosCodexApplicationIdentity> {
    return this.identityError
      ? Promise.reject(new Error("private signature detail"))
      : Promise.resolve(this.identity);
  }
  readCompatibilityReceipt(): Promise<unknown> {
    return Promise.resolve(this.receipt);
  }
  writeCompatibilityReceipt(
    receipt: MacosDesktopCompatibilityReceipt,
  ): Promise<void> {
    this.receipt = receipt;
    this.receiptWrites.push(receipt);
    return Promise.resolve();
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
    if (this.claimListenerOnLaunch) this.owner = PROCESS.pid;
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
  listenerOwnership(
    _port: number,
    process: MacosControlledProcess,
  ): Promise<"absent" | "owned" | "ambiguous"> {
    return Promise.resolve(
      this.owner === undefined
        ? "absent"
        : this.owner === process.pid
          ? "owned"
          : "ambiguous",
    );
  }
  observeDesktop(): Promise<
    Omit<DesktopControlObservation, "epoch" | "revision">
  > {
    if (this.observeError) {
      return Promise.reject(
        this.observeError instanceof Error
          ? this.observeError
          : new Error(this.observeError),
      );
    }
    return Promise.resolve({
      connected: true,
      endpointHost: "127.0.0.1",
      contractRevision: MACOS_DESKTOP_CONTROL_CONTRACT_REVISION,
      version: { ...VERSION, application: this.identity.applicationVersion },
      capabilities: ["task.list", "task.select"],
      targets: [
        { id: "opaque-1", selected: this.selectedId === "opaque-1" },
        { id: "opaque-2", selected: this.selectedId === "opaque-2" },
      ],
    });
  }
  selectDesktopTask(
    _record: MacosControlledLaunchRecord,
    targetId: string,
  ): Promise<void> {
    this.selectedId = targetId;
    this.selections.push(targetId);
    return Promise.resolve();
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
  it("uses a production-safe random epoch bound by default", async () => {
    const platform = new FakePlatform();
    const observation = await new MacosDesktopCompanionDriver(
      platform,
    ).startControlled(new AbortController().signal);
    expect(observation.epoch).toBeGreaterThan(0);
    expect(observation.epoch).toBeLessThan(2 ** 48);
  });

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
      targets: [
        { id: "opaque-1", selected: true },
        { id: "opaque-2", selected: false },
      ],
    });
  });

  it("accepts a newly signed build and qualifies it with a reversible canary", async () => {
    const platform = new FakePlatform();
    platform.identity = { ...IDENTITY, applicationVersion: "26.722.1" };
    platform.receipt = undefined;
    await driver(platform).startControlled(new AbortController().signal);
    expect(platform.selections).toEqual(["opaque-2", "opaque-1"]);
    expect(platform.selectedId).toBe("opaque-1");
    expect(platform.receiptWrites).toHaveLength(1);
    expect(platform.receiptWrites[0]?.identity).toEqual(platform.identity);
  });

  it("rejects an unverified application before creating launch state", async () => {
    const platform = new FakePlatform();
    platform.identityError = true;
    await expect(
      driver(platform).startControlled(new AbortController().signal),
    ).rejects.toThrow("applicationRejected");
    expect(platform.writes).toEqual([]);
    expect(platform.stoppedNormal).toBe(0);
  });

  it("rejects a controlled process whose listener is not yet owned", async () => {
    const platform = new FakePlatform();
    platform.claimListenerOnLaunch = false;
    await expect(
      driver(platform).startControlled(new AbortController().signal),
    ).rejects.toThrow("listenerRejected");
  });

  it("reports renderer discovery rejection without exposing details", async () => {
    const platform = new FakePlatform();
    platform.observeError = "private renderer detail";
    await expect(
      driver(platform).startControlled(new AbortController().signal),
    ).rejects.toThrow("rendererRejected");
  });

  it("reports only the bounded renderer rejection stage", async () => {
    const platform = new FakePlatform();
    platform.observeError = "invalidDesktopTasks";
    await expect(
      driver(platform).startControlled(new AbortController().signal),
    ).rejects.toThrow("taskContractRejected");
    const targetCountPlatform = new FakePlatform();
    targetCountPlatform.observeError = "invalidDesktopTargetCount";
    await expect(
      driver(targetCountPlatform).startControlled(new AbortController().signal),
    ).rejects.toThrow("rendererTargetCountRejected");
  });

  it("reports a content-free renderer target count diagnostic", async () => {
    for (const targetCount of [0, 97]) {
      const platform = new FakePlatform();
      platform.observeError = new MacosDesktopTargetCountError(targetCount);
      await expect(
        driver(platform).startControlled(new AbortController().signal),
      ).rejects.toMatchObject({
        failure:
          targetCount === 0
            ? "rendererTargetsEmpty"
            : "rendererTargetsOverLimit",
        diagnostics: { rendererTargetCount: targetCount },
      });
    }
  });

  it("reattaches only to the exact recorded process and listener", async () => {
    const platform = new FakePlatform();
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
      { ...value, schema: 1 },
      { ...value, identity: { ...IDENTITY, applicationVersion: "bad" } },
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
    expect(parseMacosDesktopCompatibilityReceipt(RECEIPT)).toEqual(RECEIPT);
    expect(() =>
      parseMacosDesktopCompatibilityReceipt({
        ...RECEIPT,
        engine: "unbounded",
      }),
    ).toThrow("invalidCompatibilityReceipt");
  });
});

function record(process?: MacosControlledProcess): MacosControlledLaunchRecord {
  return {
    schema: MACOS_CONTROL_RECORD_SCHEMA,
    phase: process ? "controlled" : "launching",
    identity: IDENTITY,
    controlId: CONTROL_ID,
    port: 49152,
    epoch: 7,
    revision: 0,
    ...(process ? { process } : {}),
  };
}
