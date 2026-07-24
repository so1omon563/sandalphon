import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { createConnection } from "node:net";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

export const DESKTOP_COMPANION_LAUNCH_AGENT_LABEL =
  "dev.so1omon.sandalphon.desktop-companion";
export const DESKTOP_COMPANION_PROTOCOL_VERSION = 3;
const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptDirectory);

export function companionPaths({
  home = homedir(),
  uid = process.getuid?.(),
} = {}) {
  if (uid === undefined || !Number.isSafeInteger(uid) || uid < 0) {
    throw new Error("unsupportedPlatform");
  }
  const supportDirectory = join(
    home,
    "Library",
    "Application Support",
    "Sandalphon",
  );
  const launchAgentsDirectory = join(home, "Library", "LaunchAgents");
  const runtimeDirectory = `/private/tmp/dev.so1omon.sandalphon-${uid}`;
  return {
    uid,
    domain: `gui/${uid}`,
    service: `gui/${uid}/${DESKTOP_COMPANION_LAUNCH_AGENT_LABEL}`,
    sourceCompanion: join(repositoryRoot, "dist", "desktop-companion.mjs"),
    supportDirectory,
    installedCompanion: join(supportDirectory, "desktop-companion.mjs"),
    launchAgentsDirectory,
    launchAgent: join(
      launchAgentsDirectory,
      `${DESKTOP_COMPANION_LAUNCH_AGENT_LABEL}.plist`,
    ),
    runtimeDirectory,
    socketPath: join(runtimeDirectory, "desktop-companion.sock"),
    recordPath: join(runtimeDirectory, "controlled-launch.json"),
  };
}

export function renderLaunchAgentPlist({
  nodePath,
  companionPath,
  runtimeDirectory,
}) {
  for (const value of [nodePath, companionPath, runtimeDirectory]) {
    if (
      typeof value !== "string" ||
      !isAbsolute(value) ||
      hasControlCharacter(value)
    ) {
      throw new Error("invalidLaunchAgentPath");
    }
  }
  const argumentsList = [
    nodePath,
    companionPath,
    "serve",
    "--runtime-directory",
    runtimeDirectory,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(DESKTOP_COMPANION_LAUNCH_AGENT_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
${argumentsList.map((value) => `    <string>${escapeXml(value)}</string>`).join("\n")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ExitTimeOut</key>
  <integer>10</integer>
  <key>Umask</key>
  <integer>63</integer>
  <key>StandardOutPath</key>
  <string>/dev/null</string>
  <key>StandardErrorPath</key>
  <string>/dev/null</string>
</dict>
</plist>
`;
}

export function parseManagementArguments(argv) {
  if (
    argv.length !== 1 ||
    !["install", "uninstall", "status", "start", "stop", "recover"].includes(
      argv[0],
    )
  ) {
    throw new Error("invalidArguments");
  }
  return argv[0];
}

export function summarizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("invalidCompanionResponse");
  }
  const desktop = snapshot.desktop;
  if (!desktop || typeof desktop !== "object") {
    throw new Error("invalidCompanionResponse");
  }
  const rendererTargetCount =
    snapshot.diagnostics &&
    Number.isSafeInteger(snapshot.diagnostics.rendererTargetCount) &&
    snapshot.diagnostics.rendererTargetCount >= 0
      ? snapshot.diagnostics.rendererTargetCount
      : undefined;
  const rendererPageCount =
    snapshot.diagnostics &&
    Number.isSafeInteger(snapshot.diagnostics.rendererPageCount) &&
    snapshot.diagnostics.rendererPageCount >= 0
      ? snapshot.diagnostics.rendererPageCount
      : undefined;
  return {
    lifecycle: snapshot.lifecycle,
    sequence: snapshot.sequence,
    ...(snapshot.failure ? { failure: snapshot.failure } : {}),
    ...(snapshot.priorFailure ? { priorFailure: snapshot.priorFailure } : {}),
    ...(rendererTargetCount !== undefined || rendererPageCount !== undefined
      ? {
          diagnostics: {
            ...(rendererTargetCount !== undefined
              ? { rendererTargetCount }
              : {}),
            ...(rendererPageCount !== undefined ? { rendererPageCount } : {}),
          },
        }
      : {}),
    desktop: {
      availability: desktop.availability,
      ...(desktop.reason ? { reason: desktop.reason } : {}),
      taskCount: Array.isArray(desktop.targets) ? desktop.targets.length : 0,
    },
  };
}

async function install() {
  requireDarwinAndNode24();
  const paths = companionPaths();
  await requireRegularFile(paths.sourceCompanion);
  await ensureOwnedDirectory(paths.supportDirectory, 0o700);
  await ensureOwnedDirectory(paths.launchAgentsDirectory);
  await atomicCopy(paths.sourceCompanion, paths.installedCompanion, 0o700);
  await atomicWrite(
    paths.launchAgent,
    renderLaunchAgentPlist({
      nodePath: process.execPath,
      companionPath: paths.installedCompanion,
      runtimeDirectory: paths.runtimeDirectory,
    }),
    0o600,
  );
  if (await serviceLoaded(paths.service)) {
    await execFileAsync("/bin/launchctl", ["bootout", paths.service]);
    await waitForServiceState(paths.service, false);
  }
  await execFileAsync("/bin/launchctl", [
    "bootstrap",
    paths.domain,
    paths.launchAgent,
  ]);
  await waitForServiceState(paths.service, true);
  await execFileAsync("/bin/launchctl", ["kickstart", "-k", paths.service]);
  await waitForSocket(paths.socketPath);
  const snapshot = await requestCompanion(paths.socketPath, "status");
  console.log(
    JSON.stringify({
      installed: true,
      label: DESKTOP_COMPANION_LAUNCH_AGENT_LABEL,
      ...summarizeSnapshot(snapshot),
    }),
  );
}

async function uninstall() {
  requireDarwinAndNode24();
  const paths = companionPaths();
  if (await pathExists(paths.socketPath)) {
    await requestCompanion(paths.socketPath, "recover");
    const snapshot = await requestCompanion(paths.socketPath, "stop");
    if (
      snapshot.lifecycle !== "stopped" &&
      !(
        snapshot.lifecycle === "recoveryRequired" &&
        snapshot.failure === "reconcileFailed" &&
        !(await pathExists(paths.recordPath))
      )
    ) {
      throw new Error("cleanupNotVerified");
    }
  } else if (await pathExists(paths.recordPath)) {
    throw new Error("companionUnavailable");
  }
  if (await serviceLoaded(paths.service)) {
    await execFileAsync("/bin/launchctl", ["bootout", paths.service]);
    await waitForServiceState(paths.service, false);
  }
  await unlink(paths.launchAgent).catch(ignoreMissing);
  await unlink(paths.installedCompanion).catch(ignoreMissing);
  console.log(
    JSON.stringify({
      installed: false,
      label: DESKTOP_COMPANION_LAUNCH_AGENT_LABEL,
    }),
  );
}

async function invoke(method) {
  requireDarwinAndNode24();
  const snapshot = await requestCompanion(companionPaths().socketPath, method);
  console.log(JSON.stringify(summarizeSnapshot(snapshot)));
}

export async function requestCompanion(socketPath, method) {
  const requestId = `manager-${process.pid}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = Buffer.alloc(0);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("companionTimeout"));
    }, 35_000);
    socket.once("connect", () => {
      socket.write(
        `${JSON.stringify({
          protocolVersion: DESKTOP_COMPANION_PROTOCOL_VERSION,
          requestId,
          method,
        })}\n`,
      );
    });
    socket.on("data", (chunk) => {
      if (response.length + chunk.length > 16_384) {
        socket.destroy();
        reject(new Error("invalidCompanionResponse"));
        return;
      }
      response = Buffer.concat([response, chunk]);
    });
    socket.once("end", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(response.toString("utf8"));
        if (
          !parsed ||
          parsed.ok !== true ||
          parsed.protocolVersion !== DESKTOP_COMPANION_PROTOCOL_VERSION ||
          parsed.requestId !== requestId
        ) {
          reject(new Error("invalidCompanionResponse"));
        } else {
          resolve(parsed.snapshot);
        }
      } catch {
        reject(new Error("invalidCompanionResponse"));
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function serviceLoaded(service) {
  try {
    await execFileAsync("/bin/launchctl", ["print", service]);
    return true;
  } catch {
    return false;
  }
}

async function waitForSocket(socketPath) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await pathExists(socketPath)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("companionUnavailable");
}

async function waitForServiceState(service, expectedLoaded) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await serviceLoaded(service)) === expectedLoaded) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("companionUnavailable");
}

async function atomicCopy(source, destination, mode) {
  const temporary = `${destination}.tmp`;
  await unlink(temporary).catch(ignoreMissing);
  await copyFile(source, temporary);
  await chmod(temporary, mode);
  await rename(temporary, destination);
  await chmod(destination, mode);
}

async function atomicWrite(destination, value, mode) {
  const temporary = `${destination}.tmp`;
  await unlink(temporary).catch(ignoreMissing);
  await writeFile(temporary, value, { encoding: "utf8", mode, flag: "wx" });
  await chmod(temporary, mode);
  await rename(temporary, destination);
  await chmod(destination, mode);
}

async function requireRegularFile(path) {
  const status = await lstat(path);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error("unsafeCompanionArtifact");
  }
}

async function ensureOwnedDirectory(path, mode) {
  await mkdir(path, { recursive: true, ...(mode ? { mode } : {}) });
  const status = await lstat(path);
  const uid = process.getuid?.();
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    uid === undefined ||
    status.uid !== uid
  ) {
    throw new Error("unsafeCompanionDirectory");
  }
  if (mode !== undefined) {
    await chmod(path, mode);
  }
}

async function pathExists(path) {
  return lstat(path).then(
    () => true,
    (error) => {
      if (error?.code === "ENOENT") return false;
      throw error;
    },
  );
}

function requireDarwinAndNode24() {
  if (
    process.platform !== "darwin" ||
    Number(process.versions.node.split(".")[0]) < 24
  ) {
    throw new Error("unsupportedRuntime");
  }
}

function ignoreMissing(error) {
  if (error?.code !== "ENOENT") throw error;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function hasControlCharacter(value) {
  return [...value].some((character) => character.codePointAt(0) <= 0x1f);
}

async function main() {
  const command = parseManagementArguments(process.argv.slice(2));
  switch (command) {
    case "install":
      await install();
      break;
    case "uninstall":
      await uninstall();
      break;
    default:
      await invoke(command);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const allowed = new Set([
      "cleanupNotVerified",
      "companionTimeout",
      "companionUnavailable",
      "invalidArguments",
      "invalidCompanionResponse",
      "invalidLaunchAgentPath",
      "unsafeCompanionArtifact",
      "unsafeCompanionDirectory",
      "unsupportedRuntime",
    ]);
    const message = error instanceof Error ? error.message : "";
    console.error(allowed.has(message) ? message : "companionManagerFailed");
    process.exitCode = 1;
  });
}
