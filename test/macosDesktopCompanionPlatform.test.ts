import { describe, expect, it } from "vitest";

import { MACOS_DESKTOP_CONTROL_VERSION } from "../src/macosDesktopCompanionDriver.js";
import {
  decodeDebuggerUrl,
  decodeDesktopTaskTargets,
  parseListenerOwner,
  parseMacosCodexProcessList,
  parseMacosProcessList,
  taskListExpression,
} from "../src/macosDesktopCompanionPlatform.js";

describe("macOS desktop companion platform boundaries", () => {
  it("parses exact process identities without retaining unrelated fields", () => {
    expect(
      parseMacosProcessList(
        "  42 501 Thu Jul 24 11:00:00 2026 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT --sandalphon-control-id=11111111-1111-4111-8111-111111111111\n",
      ),
    ).toEqual([
      {
        pid: 42,
        uid: 501,
        startedAt: "Thu Jul 24 11:00:00 2026",
        command:
          "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT --sandalphon-control-id=11111111-1111-4111-8111-111111111111",
      },
    ]);
    expect(() => parseMacosProcessList("malformed")).toThrow(
      "invalidProcessObservation",
    );
    expect(
      parseMacosCodexProcessList(
        "unrelated malformed observation\n  42 501 Thu Jul 24 11:00:00 2026 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT\n",
      ),
    ).toEqual([
      {
        pid: 42,
        uid: 501,
        startedAt: "Thu Jul 24 11:00:00 2026",
        command: "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
      },
    ]);
  });

  it("accepts one listener owner and rejects ambiguity", () => {
    expect(parseListenerOwner("p42\n")).toBe(42);
    expect(parseListenerOwner("")).toBeUndefined();
    expect(() => parseListenerOwner("p42\np43\n")).toThrow(
      "ambiguousListenerOwner",
    );
  });

  it("admits only the exact loopback debugger page and version tuple", () => {
    const discovery = {
      version: {
        Browser: `Chrome/${MACOS_DESKTOP_CONTROL_VERSION.engine}`,
        "Protocol-Version": MACOS_DESKTOP_CONTROL_VERSION.protocol,
      },
      targets: [
        {
          type: "page",
          url: "app://-",
          webSocketDebuggerUrl: "ws://127.0.0.1:49152/devtools/page/opaque",
        },
      ],
    };
    expect(
      decodeDebuggerUrl(discovery, 49152, MACOS_DESKTOP_CONTROL_VERSION),
    ).toBe("ws://127.0.0.1:49152/devtools/page/opaque");
    expect(() =>
      decodeDebuggerUrl(
        {
          ...discovery,
          targets: [
            {
              ...discovery.targets[0],
              webSocketDebuggerUrl: "ws://0.0.0.0:49152/devtools/page/opaque",
            },
          ],
        },
        49152,
        MACOS_DESKTOP_CONTROL_VERSION,
      ),
    ).toThrow("unsafeDesktopEndpoint");
  });

  it("projects only bounded opaque task identity", () => {
    expect(
      decodeDesktopTaskTargets([
        { id: "one", selected: true, title: "discard" },
        { id: "two", selected: false, prompt: "discard" },
      ]),
    ).toEqual([
      { id: "one", selected: true },
      { id: "two", selected: false },
    ]);
    for (const invalid of [
      [],
      [{ id: "one", selected: false }],
      [
        { id: "one", selected: true },
        { id: "one", selected: false },
      ],
      [{ id: "one", selected: "yes" }],
    ]) {
      expect(() => decodeDesktopTaskTargets(invalid)).toThrow(
        "invalidDesktopTasks",
      );
    }
  });

  it("uses only the accepted sidebar task selector and opaque fields", () => {
    const expression = taskListExpression();
    expect(expression).toContain("data-app-action-sidebar-thread-id");
    expect(expression).toContain("aria-current");
    expect(expression).not.toContain("textContent");
    expect(expression).not.toContain("innerText");
  });
});
