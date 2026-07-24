import { randomInt, randomUUID } from "node:crypto";

import type {
  DesktopCompanionDriver,
  DesktopCompanionRecovery,
} from "./desktopCompanion.js";
import type { DesktopControlObservation } from "./desktopControlContract.js";

export const MACOS_CODEX_APPLICATION_PATH = "/Applications/ChatGPT.app";
export const MACOS_CODEX_EXECUTABLE_PATH =
  "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
export const MACOS_DESKTOP_CONTROL_CONTRACT_REVISION = 1 as const;
export const MACOS_CONTROL_RECORD_SCHEMA = 2 as const;
export const MACOS_COMPATIBILITY_RECEIPT_SCHEMA = 1 as const;
const CONTROL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface MacosControlledProcess {
  readonly pid: number;
  readonly startedAt: string;
}

export interface MacosCodexApplicationIdentity {
  readonly applicationVersion: string;
  readonly bundleVersion: string;
  readonly bundleIdentifier: "com.openai.codex";
  readonly teamIdentifier: "2DC432GLL2";
  readonly cdHash: string;
}

export interface MacosDesktopCompatibilityReceipt {
  readonly schema: typeof MACOS_COMPATIBILITY_RECEIPT_SCHEMA;
  readonly contractRevision: typeof MACOS_DESKTOP_CONTROL_CONTRACT_REVISION;
  readonly identity: MacosCodexApplicationIdentity;
  readonly engine: string;
  readonly protocol: "1.3";
}

export interface MacosControlledLaunchRecord {
  readonly schema: typeof MACOS_CONTROL_RECORD_SCHEMA;
  readonly phase: "launching" | "controlled";
  readonly identity: MacosCodexApplicationIdentity;
  readonly controlId: string;
  readonly port: number;
  readonly epoch: number;
  readonly revision: number;
  readonly process?: MacosControlledProcess;
}

export interface MacosDesktopCompanionPlatform {
  readApplicationIdentity(
    signal: AbortSignal,
  ): Promise<MacosCodexApplicationIdentity>;
  readCompatibilityReceipt(signal: AbortSignal): Promise<unknown>;
  writeCompatibilityReceipt(
    receipt: MacosDesktopCompatibilityReceipt,
    signal: AbortSignal,
  ): Promise<void>;
  readLaunchRecord(signal: AbortSignal): Promise<unknown>;
  writeLaunchRecord(
    record: MacosControlledLaunchRecord,
    signal: AbortSignal,
  ): Promise<void>;
  deleteLaunchRecord(signal: AbortSignal): Promise<void>;
  allocateLoopbackPort(signal: AbortSignal): Promise<number>;
  launchControlled(
    record: MacosControlledLaunchRecord,
    signal: AbortSignal,
  ): Promise<MacosControlledProcess>;
  findControlledProcesses(
    controlId: string | undefined,
    signal: AbortSignal,
  ): Promise<readonly MacosControlledProcess[]>;
  listenerOwner(port: number, signal: AbortSignal): Promise<number | undefined>;
  observeDesktop(
    record: MacosControlledLaunchRecord,
    signal: AbortSignal,
  ): Promise<Omit<DesktopControlObservation, "epoch" | "revision">>;
  selectDesktopTask(
    record: MacosControlledLaunchRecord,
    targetId: string,
    signal: AbortSignal,
  ): Promise<void>;
  terminateControlled(
    process: MacosControlledProcess,
    signal: AbortSignal,
  ): Promise<void>;
  stopNormal(signal: AbortSignal): Promise<void>;
  launchNormal(signal: AbortSignal): Promise<void>;
  normalProcessCount(signal: AbortSignal): Promise<number>;
}

export interface MacosDesktopCompanionDriverOptions {
  readonly createControlId?: () => string;
  readonly createEpoch?: () => number;
}

export class MacosDesktopCompanionDriver implements DesktopCompanionDriver {
  readonly #platform: MacosDesktopCompanionPlatform;
  readonly #createControlId: () => string;
  readonly #createEpoch: () => number;

  constructor(
    platform: MacosDesktopCompanionPlatform,
    options: MacosDesktopCompanionDriverOptions = {},
  ) {
    this.#platform = platform;
    this.#createControlId = options.createControlId ?? randomUUID;
    this.#createEpoch =
      options.createEpoch ?? (() => randomInt(1, Number.MAX_SAFE_INTEGER));
  }

  async startControlled(
    signal: AbortSignal,
  ): Promise<DesktopControlObservation> {
    const identity = await this.#platform.readApplicationIdentity(signal);
    if ((await this.#readRecord(signal)) !== undefined) {
      throw new Error("controlledRecordExists");
    }
    if (
      (await this.#platform.findControlledProcesses(undefined, signal)).length
    ) {
      throw new Error("controlledProcessExists");
    }

    const launching: MacosControlledLaunchRecord = {
      schema: MACOS_CONTROL_RECORD_SCHEMA,
      phase: "launching",
      identity,
      controlId: this.#createControlId(),
      port: await this.#platform.allocateLoopbackPort(signal),
      epoch: this.#createEpoch(),
      revision: 0,
    };
    await this.#platform.writeLaunchRecord(launching, signal);
    await this.#platform.stopNormal(signal);
    const process = await this.#platform.launchControlled(launching, signal);
    const controlled: MacosControlledLaunchRecord = {
      ...launching,
      phase: "controlled",
      process,
    };
    await this.#platform.writeLaunchRecord(controlled, signal);
    return this.#observe(controlled, signal);
  }

  async reconcileControlled(
    signal: AbortSignal,
  ): Promise<DesktopCompanionRecovery> {
    const record = await this.#readRecord(signal);
    if (!record) {
      return (await this.#platform.findControlledProcesses(undefined, signal))
        .length === 0
        ? { kind: "normal" }
        : { kind: "ambiguous" };
    }

    const matches = await this.#platform.findControlledProcesses(
      record.controlId,
      signal,
    );
    const allControlled = await this.#platform.findControlledProcesses(
      undefined,
      signal,
    );
    if (allControlled.length !== matches.length) return { kind: "ambiguous" };
    if (matches.length > 1) return { kind: "ambiguous" };
    const match = matches[0];
    if (!match) {
      const owner = await this.#platform.listenerOwner(record.port, signal);
      if (owner !== undefined) return { kind: "ambiguous" };
      await this.#platform.deleteLaunchRecord(signal);
      await this.#ensureNormal(signal);
      return { kind: "normal" };
    }
    if (record.process && !sameProcess(record.process, match)) {
      return { kind: "ambiguous" };
    }
    const owner = await this.#platform.listenerOwner(record.port, signal);
    if (owner !== match.pid) return { kind: "ambiguous" };
    const controlled: MacosControlledLaunchRecord = {
      ...record,
      phase: "controlled",
      process: match,
    };
    await this.#platform.writeLaunchRecord(controlled, signal);
    return {
      kind: "controlled",
      observation: await this.#observe(controlled, signal),
    };
  }

  async cleanupControlled(signal: AbortSignal): Promise<void> {
    const record = await this.#readRecord(signal);
    if (!record) {
      if (
        (await this.#platform.findControlledProcesses(undefined, signal))
          .length !== 0
      ) {
        throw new Error("unownedControlledProcess");
      }
      await this.#ensureNormal(signal);
      return;
    }

    const matches = await this.#platform.findControlledProcesses(
      record.controlId,
      signal,
    );
    const allControlled = await this.#platform.findControlledProcesses(
      undefined,
      signal,
    );
    if (allControlled.length !== matches.length) {
      throw new Error("unownedControlledProcess");
    }
    if (matches.length > 1) throw new Error("ambiguousControlledProcess");
    const match = matches[0];
    if (match && record.process && !sameProcess(record.process, match)) {
      throw new Error("controlledProcessChanged");
    }
    const owner = await this.#platform.listenerOwner(record.port, signal);
    if (owner !== undefined && (!match || owner !== match.pid)) {
      throw new Error("listenerOwnershipChanged");
    }
    if (match) await this.#platform.terminateControlled(match, signal);
    if (
      (await this.#platform.listenerOwner(record.port, signal)) !== undefined
    ) {
      throw new Error("listenerStillOpen");
    }
    await this.#platform.deleteLaunchRecord(signal);
    await this.#ensureNormal(signal);
  }

  async #ensureNormal(signal: AbortSignal): Promise<void> {
    if ((await this.#platform.normalProcessCount(signal)) === 0) {
      await this.#platform.launchNormal(signal);
    }
    if ((await this.#platform.normalProcessCount(signal)) !== 1) {
      throw new Error("normalProcessUnverified");
    }
  }

  async verifyControlled(signal: AbortSignal): Promise<void> {
    const record = await this.#readRecord(signal);
    if (!record?.process) throw new Error("controlledRecordUnavailable");
    const matches = await this.#platform.findControlledProcesses(
      record.controlId,
      signal,
    );
    if (matches.length !== 1 || !sameProcess(record.process, matches[0]!)) {
      throw new Error("controlledProcessChanged");
    }
    if (
      (await this.#platform.listenerOwner(record.port, signal)) !==
      record.process.pid
    ) {
      throw new Error("listenerOwnershipChanged");
    }
    const observed = await this.#platform.observeDesktop(record, signal);
    await this.#requireReceipt(record, observed, signal);
  }

  async #observe(
    record: MacosControlledLaunchRecord,
    signal: AbortSignal,
  ): Promise<DesktopControlObservation> {
    const process = requireControlledProcess(record);
    const owner = await this.#platform.listenerOwner(record.port, signal);
    if (owner !== process.pid) throw new Error("listenerOwnershipUnverified");
    const observed = await this.#platform.observeDesktop(record, signal);
    await this.#qualify(record, observed, signal);
    const next = { ...record, revision: record.revision + 1 };
    await this.#platform.writeLaunchRecord(next, signal);
    return {
      ...observed,
      epoch: next.epoch,
      revision: next.revision,
    };
  }

  async #readRecord(
    signal: AbortSignal,
  ): Promise<MacosControlledLaunchRecord | undefined> {
    const raw = await this.#platform.readLaunchRecord(signal);
    if (raw === undefined) return undefined;
    const record = parseMacosControlledLaunchRecord(raw);
    return record;
  }

  async #qualify(
    record: MacosControlledLaunchRecord,
    observed: Omit<DesktopControlObservation, "epoch" | "revision">,
    signal: AbortSignal,
  ): Promise<void> {
    const rawReceipt = await this.#platform.readCompatibilityReceipt(signal);
    if (rawReceipt !== undefined) {
      try {
        const receipt = parseMacosDesktopCompatibilityReceipt(rawReceipt);
        if (receiptMatches(receipt, record.identity, observed)) return;
      } catch {
        // A stale or malformed receipt grants no authority.
      }
    }
    const selected = observed.targets.find((target) => target.selected);
    const alternate = observed.targets.find((target) => !target.selected);
    if (!selected || !alternate)
      throw new Error("qualificationCanaryUnavailable");
    await this.#platform.selectDesktopTask(record, alternate.id, signal);
    const changed = await this.#platform.observeDesktop(record, signal);
    if (
      changed.targets.find((target) => target.selected)?.id !== alternate.id
    ) {
      throw new Error("qualificationCanaryFailed");
    }
    await this.#platform.selectDesktopTask(record, selected.id, signal);
    const restored = await this.#platform.observeDesktop(record, signal);
    if (
      restored.targets.find((target) => target.selected)?.id !== selected.id
    ) {
      throw new Error("qualificationRestoreFailed");
    }
    await this.#platform.writeCompatibilityReceipt(
      {
        schema: MACOS_COMPATIBILITY_RECEIPT_SCHEMA,
        contractRevision: MACOS_DESKTOP_CONTROL_CONTRACT_REVISION,
        identity: record.identity,
        engine: restored.version.engine,
        protocol: "1.3",
      },
      signal,
    );
  }

  async #requireReceipt(
    record: MacosControlledLaunchRecord,
    observed: Omit<DesktopControlObservation, "epoch" | "revision">,
    signal: AbortSignal,
  ): Promise<void> {
    const raw = await this.#platform.readCompatibilityReceipt(signal);
    if (
      raw === undefined ||
      !receiptMatches(
        parseMacosDesktopCompatibilityReceipt(raw),
        record.identity,
        observed,
      )
    ) {
      throw new Error("compatibilityReceiptUnavailable");
    }
  }
}

export function parseMacosControlledLaunchRecord(
  value: unknown,
): MacosControlledLaunchRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalidControlledRecord");
  }
  const record = value as Record<string, unknown>;
  const process = record.process;
  const expectedKeys =
    process === undefined
      ? [
          "controlId",
          "epoch",
          "identity",
          "phase",
          "port",
          "revision",
          "schema",
        ]
      : [
          "controlId",
          "epoch",
          "identity",
          "phase",
          "port",
          "process",
          "revision",
          "schema",
        ];
  const validProcess =
    process === undefined ||
    (!!process &&
      typeof process === "object" &&
      !Array.isArray(process) &&
      Object.keys(process).sort().join(",") === "pid,startedAt" &&
      Number.isSafeInteger((process as Record<string, unknown>).pid) &&
      ((process as Record<string, unknown>).pid as number) > 0 &&
      typeof (process as Record<string, unknown>).startedAt === "string" &&
      ((process as Record<string, unknown>).startedAt as string).length > 0);
  if (
    record.schema !== MACOS_CONTROL_RECORD_SCHEMA ||
    Object.keys(record).sort().join(",") !== expectedKeys.sort().join(",") ||
    (record.phase !== "launching" && record.phase !== "controlled") ||
    !isMacosCodexApplicationIdentity(record.identity) ||
    typeof record.controlId !== "string" ||
    !CONTROL_ID_PATTERN.test(record.controlId) ||
    !isPort(record.port) ||
    !isCounter(record.epoch) ||
    record.epoch === 0 ||
    !isCounter(record.revision) ||
    !validProcess ||
    (record.phase === "controlled" && process === undefined) ||
    (record.phase === "launching" && process !== undefined)
  ) {
    throw new Error("invalidControlledRecord");
  }
  return {
    schema: MACOS_CONTROL_RECORD_SCHEMA,
    phase: record.phase,
    identity: record.identity,
    controlId: record.controlId,
    port: record.port,
    epoch: record.epoch,
    revision: record.revision,
    ...(process
      ? {
          process: {
            pid: (process as Record<string, unknown>).pid as number,
            startedAt: (process as Record<string, unknown>).startedAt as string,
          },
        }
      : {}),
  };
}

export function parseMacosDesktopCompatibilityReceipt(
  value: unknown,
): MacosDesktopCompatibilityReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalidCompatibilityReceipt");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !==
      "contractRevision,engine,identity,protocol,schema" ||
    record.schema !== MACOS_COMPATIBILITY_RECEIPT_SCHEMA ||
    record.contractRevision !== MACOS_DESKTOP_CONTROL_CONTRACT_REVISION ||
    !isMacosCodexApplicationIdentity(record.identity) ||
    typeof record.engine !== "string" ||
    !/^\d+(?:\.\d+){3}$/u.test(record.engine) ||
    record.protocol !== "1.3"
  ) {
    throw new Error("invalidCompatibilityReceipt");
  }
  return record as unknown as MacosDesktopCompatibilityReceipt;
}

function isMacosCodexApplicationIdentity(
  value: unknown,
): value is MacosCodexApplicationIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).sort().join(",") ===
      "applicationVersion,bundleIdentifier,bundleVersion,cdHash,teamIdentifier" &&
    typeof record.applicationVersion === "string" &&
    /^[0-9.]{1,32}$/u.test(record.applicationVersion) &&
    typeof record.bundleVersion === "string" &&
    /^[0-9]{1,16}$/u.test(record.bundleVersion) &&
    record.bundleIdentifier === "com.openai.codex" &&
    record.teamIdentifier === "2DC432GLL2" &&
    typeof record.cdHash === "string" &&
    /^[0-9a-f]{40}$/u.test(record.cdHash)
  );
}

function receiptMatches(
  receipt: MacosDesktopCompatibilityReceipt,
  identity: MacosCodexApplicationIdentity,
  observation: Omit<DesktopControlObservation, "epoch" | "revision">,
): boolean {
  return (
    JSON.stringify(receipt.identity) === JSON.stringify(identity) &&
    receipt.contractRevision === observation.contractRevision &&
    receipt.engine === observation.version.engine &&
    receipt.protocol === observation.version.protocol
  );
}

export function controlledLaunchArguments(
  record: MacosControlledLaunchRecord,
): readonly string[] {
  return [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${record.port}`,
    `--sandalphon-control-id=${record.controlId}`,
  ];
}

function requireControlledProcess(
  record: MacosControlledLaunchRecord,
): MacosControlledProcess {
  if (!record.process) throw new Error("controlledProcessUnavailable");
  return record.process;
}

function sameProcess(
  expected: MacosControlledProcess,
  observed: MacosControlledProcess,
): boolean {
  return (
    expected.pid === observed.pid && expected.startedAt === observed.startedAt
  );
}

function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPort(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= 65_535
  );
}
