import { describe, expect, it } from "vitest";

import {
  decodeDesktopTasks,
  decodeDiscovery,
  parseProbeArguments,
  PROVEN_DESKTOP_VERSION,
  summarizeDesktopTasks,
  switchAndRestoreExpression,
  taskListExpression,
} from "../scripts/probe-desktop-control.mjs";

describe("desktop control feasibility probe", () => {
  it("requires the exact application version and a bounded port", () => {
    expect(
      parseProbeArguments([
        "--port",
        "57799",
        "--application-version",
        PROVEN_DESKTOP_VERSION.application,
        "--switch-and-restore",
      ]),
    ).toEqual({ port: 57799, switchAndRestore: true });
    for (const arguments_ of [
      [],
      [
        "--port",
        "0",
        "--application-version",
        PROVEN_DESKTOP_VERSION.application,
      ],
      ["--port", "57799", "--application-version", "future"],
      ["--unknown", "value"],
    ]) {
      expect(() => parseProbeArguments(arguments_)).toThrow();
    }
  });

  it("accepts only one loopback page target on the exact engine and protocol", () => {
    const discovery = {
      browser: `Chrome/${PROVEN_DESKTOP_VERSION.engine}`,
      protocol: PROVEN_DESKTOP_VERSION.protocol,
      targets: [
        {
          type: "page",
          url: "app://-",
          webSocketDebuggerUrl: "ws://127.0.0.1:57799/devtools/page/opaque",
        },
      ],
    };
    expect(decodeDiscovery(discovery, 57799)).toBe(
      "ws://127.0.0.1:57799/devtools/page/opaque",
    );
    expect(() =>
      decodeDiscovery(
        {
          ...discovery,
          targets: [
            {
              ...discovery.targets[0],
              webSocketDebuggerUrl: "ws://0.0.0.0:57799/devtools/page/opaque",
            },
          ],
        },
        57799,
      ),
    ).toThrow("unsafeEndpoint");
    expect(() =>
      decodeDiscovery({ ...discovery, protocol: "future" }, 57799),
    ).toThrow("unsupportedDesktopVersion");
  });

  it("keeps task identities opaque and fails closed on malformed selection", () => {
    const tasks = decodeDesktopTasks([
      { id: "opaque-1", selected: true, visible: true },
      { id: "opaque-2", selected: false, visible: true },
    ]);
    expect(summarizeDesktopTasks(tasks)).toEqual({
      capabilities: ["task.list", "task.select"],
      taskCount: 2,
      selectedCount: 1,
      visibleAlternativeCount: 1,
    });
    for (const invalid of [
      [],
      [
        { id: "same", selected: true, visible: true },
        { id: "same", selected: false, visible: true },
      ],
      [{ id: "one", selected: false, visible: true }],
      [{ id: "one", selected: true, visible: "yes" }],
    ]) {
      expect(() => decodeDesktopTasks(invalid)).toThrow("invalidTaskState");
    }
  });

  it("builds selectors without embedding task content or executable input", () => {
    expect(taskListExpression()).toContain("data-app-action-sidebar-thread-id");
    const expression = switchAndRestoreExpression(
      'original";throw new Error("bad")//',
      'candidate";throw new Error("bad")//',
    );
    expect(expression).toContain(
      JSON.stringify('original";throw new Error("bad")//'),
    );
    expect(expression).toContain(
      JSON.stringify('candidate";throw new Error("bad")//'),
    );
  });
});
