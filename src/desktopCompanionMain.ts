import { pathToFileURL } from "node:url";

import { DesktopCompanionSupervisor } from "./desktopCompanion.js";
import {
  ensureSecureRuntimeDirectory,
  listenDesktopCompanion,
} from "./desktopCompanionServer.js";
import {
  MACOS_DESKTOP_CONTROL_VERSION,
  MacosDesktopCompanionDriver,
} from "./macosDesktopCompanionDriver.js";
import { NodeMacosDesktopCompanionPlatform } from "./macosDesktopCompanionPlatform.js";

const CAPABILITY_MONITOR_MS = 2_000;
const CAPABILITY_MONITOR_TIMEOUT_MS = 5_000;

export function defaultMacosDesktopCompanionRuntimeDirectory(
  uid: number,
): string {
  if (!Number.isSafeInteger(uid) || uid < 0) throw new Error("invalidUid");
  return `/private/tmp/dev.so1omon.sandalphon-${uid}`;
}

export function parseDesktopCompanionMainArguments(argv: readonly string[]): {
  readonly runtimeDirectory: string;
} {
  if (
    argv.length !== 3 ||
    argv[0] !== "serve" ||
    argv[1] !== "--runtime-directory" ||
    !argv[2]
  ) {
    throw new Error("invalidArguments");
  }
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error("unsupportedPlatform");
  const expected = defaultMacosDesktopCompanionRuntimeDirectory(uid);
  if (argv[2] !== expected) throw new Error("invalidRuntimeDirectory");
  return { runtimeDirectory: expected };
}

export async function runDesktopCompanion(
  runtimeDirectory: string,
): Promise<void> {
  if (process.platform !== "darwin") throw new Error("unsupportedPlatform");
  const resolvedRuntime = await ensureSecureRuntimeDirectory(runtimeDirectory);
  const platform = new NodeMacosDesktopCompanionPlatform(
    resolvedRuntime,
    MACOS_DESKTOP_CONTROL_VERSION,
  );
  const driver = new MacosDesktopCompanionDriver(platform);
  const supervisor = new DesktopCompanionSupervisor(driver, {
    enabled: true,
    allowedVersions: [MACOS_DESKTOP_CONTROL_VERSION],
  });
  await supervisor.recover();
  const server = await listenDesktopCompanion(resolvedRuntime, supervisor);
  let monitoring = false;
  let monitorController: AbortController | undefined;
  let shuttingDown = false;
  const monitor = setInterval(() => {
    if (
      monitoring ||
      shuttingDown ||
      supervisor.status().lifecycle !== "ready"
    ) {
      return;
    }
    monitoring = true;
    const controller = new AbortController();
    monitorController = controller;
    const deadline = setTimeout(
      () => controller.abort(),
      CAPABILITY_MONITOR_TIMEOUT_MS,
    );
    void driver
      .verifyControlled(controller.signal)
      .catch(async () => {
        if (!shuttingDown) await supervisor.capabilityLost();
      })
      .finally(() => {
        clearTimeout(deadline);
        monitoring = false;
        monitorController = undefined;
      });
  }, CAPABILITY_MONITOR_MS);
  monitor.unref();

  await new Promise<void>((resolve, reject) => {
    const shutdown = (): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      clearInterval(monitor);
      monitorController?.abort();
      void server.close().then(resolve, reject);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

async function main(): Promise<void> {
  const { runtimeDirectory } = parseDesktopCompanionMainArguments(
    process.argv.slice(2),
  );
  await runDesktopCompanion(runtimeDirectory);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error("desktopCompanionFailed");
    process.exitCode = 1;
  });
}
