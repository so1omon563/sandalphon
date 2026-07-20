/* global AbortSignal, WebSocket, fetch */

import { execFile } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";
import { pathToFileURL, URL } from "node:url";
import { promisify } from "node:util";

export const PROVEN_DESKTOP_VERSION = Object.freeze({
  application: "26.715.52143",
  engine: "150.0.7871.124",
  protocol: "1.3",
});

const TASK_ROW_SELECTOR =
  '[role="button"][data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-id]';
const execFileAsync = promisify(execFile);

export function parseProbeArguments(argv) {
  const values = new Map();
  let switchAndRestore = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--switch-and-restore") {
      switchAndRestore = true;
      continue;
    }
    if (argument !== "--port" && argument !== "--application-version") {
      throw new Error("invalidArguments");
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error("invalidArguments");
    values.set(argument, value);
    index += 1;
  }
  const port = Number.parseInt(values.get("--port") ?? "", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("invalidPort");
  }
  if (
    values.get("--application-version") !== PROVEN_DESKTOP_VERSION.application
  ) {
    throw new Error("unsupportedApplicationVersion");
  }
  return { port, switchAndRestore };
}

export function decodeDiscovery(value, port) {
  if (!value || typeof value !== "object") throw new Error("invalidDiscovery");
  const record = value;
  if (
    record.browser !== `Chrome/${PROVEN_DESKTOP_VERSION.engine}` ||
    record.protocol !== PROVEN_DESKTOP_VERSION.protocol ||
    !Array.isArray(record.targets) ||
    record.targets.length !== 1
  ) {
    throw new Error("unsupportedDesktopVersion");
  }
  const target = record.targets[0];
  if (
    !target ||
    typeof target !== "object" ||
    target.type !== "page" ||
    target.url !== "app://-"
  ) {
    throw new Error("invalidDiscovery");
  }
  const debuggerUrl = new URL(String(target.webSocketDebuggerUrl));
  if (
    debuggerUrl.protocol !== "ws:" ||
    debuggerUrl.hostname !== "127.0.0.1" ||
    debuggerUrl.port !== String(port)
  ) {
    throw new Error("unsafeEndpoint");
  }
  return debuggerUrl.href;
}

async function verifyInstalledApplicationVersion() {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "/usr/libexec/PlistBuddy",
      [
        "-c",
        "Print :CFBundleShortVersionString",
        "/Applications/ChatGPT.app/Contents/Info.plist",
      ],
      { encoding: "utf8", timeout: 5000 },
    ));
  } catch {
    throw new Error("applicationVersionUnavailable");
  }
  if (stdout.trim() !== PROVEN_DESKTOP_VERSION.application) {
    throw new Error("unsupportedApplicationVersion");
  }
}

export function decodeDesktopTasks(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    throw new Error("invalidTaskState");
  }
  const ids = new Set();
  const tasks = value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("invalidTaskState");
    }
    const id = candidate.id;
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > 256 ||
      ids.has(id) ||
      typeof candidate.selected !== "boolean" ||
      typeof candidate.visible !== "boolean"
    ) {
      throw new Error("invalidTaskState");
    }
    ids.add(id);
    return { id, selected: candidate.selected, visible: candidate.visible };
  });
  if (tasks.filter(({ selected }) => selected).length !== 1) {
    throw new Error("invalidTaskState");
  }
  return tasks;
}

export function summarizeDesktopTasks(tasks) {
  return {
    capabilities: ["task.list", "task.select"],
    taskCount: tasks.length,
    selectedCount: tasks.filter(({ selected }) => selected).length,
    visibleAlternativeCount: tasks.filter(
      ({ selected, visible }) => visible && !selected,
    ).length,
  };
}

export function taskListExpression() {
  return `(() => Array.from(document.querySelectorAll(${JSON.stringify(TASK_ROW_SELECTOR)})).map((row) => {
    const box = row.getBoundingClientRect();
    return {
      id: row.getAttribute("data-app-action-sidebar-thread-id"),
      selected: row.getAttribute("aria-current") === "page",
      visible: box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight,
    };
  }))()`;
}

export function switchAndRestoreExpression(originalId, candidateId) {
  return `(async () => {
    const selector = ${JSON.stringify(TASK_ROW_SELECTOR)};
    const id = (row) => row?.getAttribute("data-app-action-sidebar-thread-id");
    const rows = () => Array.from(document.querySelectorAll(selector));
    const selectedId = () => id(rows().find((row) => row.getAttribute("aria-current") === "page"));
    const waitFor = async (expected) => {
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        if (selectedId() === expected) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };
    const candidate = rows().find((row) => id(row) === ${JSON.stringify(candidateId)});
    if (!candidate) return { switched: false, restored: false };
    candidate.click();
    if (!(await waitFor(${JSON.stringify(candidateId)}))) {
      return { switched: false, restored: false };
    }
    const original = rows().find((row) => id(row) === ${JSON.stringify(originalId)});
    if (!original) return { switched: true, restored: false };
    original.click();
    return { switched: true, restored: await waitFor(${JSON.stringify(originalId)}) };
  })()`;
}

class CdpSession {
  #nextId = 1;
  #pending = new Map();
  #socket;

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        for (const pending of this.#pending.values()) {
          pending.reject(new Error("cdpProtocolError"));
        }
        this.#pending.clear();
        this.#socket.close();
        return;
      }
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.result?.exceptionDetails)
        pending.reject(new Error("cdpEvaluationFailed"));
      else pending.resolve(message.result?.result?.value);
    });
  }

  evaluate(expression) {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("cdpTimeout"));
      }, 12_000);
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.#socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
  }

  close() {
    this.#socket.close();
  }
}

async function connect(debuggerUrl) {
  const socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("cdpConnectFailed")),
      { once: true },
    );
  });
  return new CdpSession(socket);
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error("cdpDiscoveryFailed");
  }
  if (!response.ok) throw new Error("cdpDiscoveryFailed");
  return response.json();
}

async function main() {
  const { port, switchAndRestore } = parseProbeArguments(process.argv.slice(2));
  await verifyInstalledApplicationVersion();
  const origin = `http://127.0.0.1:${port}`;
  const [version, targets] = await Promise.all([
    fetchJson(`${origin}/json/version`),
    fetchJson(`${origin}/json/list`),
  ]);
  const debuggerUrl = decodeDiscovery(
    {
      browser: version.Browser,
      protocol: version["Protocol-Version"],
      targets,
    },
    port,
  );
  const session = await connect(debuggerUrl);
  try {
    const tasks = decodeDesktopTasks(
      await session.evaluate(taskListExpression()),
    );
    const summary = summarizeDesktopTasks(tasks);
    if (!switchAndRestore) {
      console.log(
        JSON.stringify(
          { ...summary, switched: false, restored: false },
          null,
          2,
        ),
      );
      return;
    }
    const original = tasks.find(({ selected }) => selected);
    const candidate = tasks.find(
      ({ selected, visible }) => visible && !selected,
    );
    if (!original || !candidate) throw new Error("missingTaskAlternative");
    const result = await session.evaluate(
      switchAndRestoreExpression(original.id, candidate.id),
    );
    if (!result || result.switched !== true || result.restored !== true) {
      throw new Error("taskSelectionFailed");
    }
    console.log(
      JSON.stringify({ ...summary, switched: true, restored: true }, null, 2),
    );
  } finally {
    session.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const allowed = new Set([
      "applicationVersionUnavailable",
      "cdpConnectFailed",
      "cdpDiscoveryFailed",
      "cdpEvaluationFailed",
      "cdpProtocolError",
      "cdpTimeout",
      "invalidArguments",
      "invalidDiscovery",
      "invalidPort",
      "invalidTaskState",
      "missingTaskAlternative",
      "taskSelectionFailed",
      "unsafeEndpoint",
      "unsupportedApplicationVersion",
      "unsupportedDesktopVersion",
    ]);
    const message = error instanceof Error ? error.message : "";
    console.error(allowed.has(message) ? message : "desktopProbeFailed");
    process.exitCode = 1;
  });
}
