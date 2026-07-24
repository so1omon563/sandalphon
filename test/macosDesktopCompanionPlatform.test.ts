import { describe, expect, it } from "vitest";

import {
  decodeDebuggerPage,
  decodeDesktopTaskTargets,
  isRetryableRendererDiscovery,
  parseMacosCodexApplicationIdentity,
  parseListenerOwner,
  parseListenerOwners,
  parseMacosCodexProcessList,
  parseMacosProcessList,
  taskListExpression,
  taskSelectionExpression,
} from "../src/macosDesktopCompanionPlatform.js";

const ENGINE = "150.0.7871.124";

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
    expect(parseListenerOwners("p42\np43\np42\n")).toEqual([42, 43]);
    expect(() => parseListenerOwner("p42\np43\n")).toThrow(
      "ambiguousListenerOwner",
    );
  });

  it("admits only the exact loopback debugger page and version tuple", () => {
    const discovery = {
      version: {
        Browser: `Chrome/${ENGINE}`,
        "Protocol-Version": "1.3",
      },
      targets: [
        {
          type: "page",
          url: "app://-",
          webSocketDebuggerUrl: "ws://127.0.0.1:49152/devtools/page/opaque",
        },
      ],
    };
    expect(decodeDebuggerPage(discovery, 49152)).toEqual({
      debuggerUrl: "ws://127.0.0.1:49152/devtools/page/opaque",
      engine: ENGINE,
      protocol: "1.3",
    });
    expect(
      decodeDebuggerPage(
        {
          ...discovery,
          targets: [
            { type: "background_page", url: "chrome-extension://ignored" },
            ...discovery.targets,
          ],
        },
        49152,
      ),
    ).toEqual({
      debuggerUrl: "ws://127.0.0.1:49152/devtools/page/opaque",
      engine: ENGINE,
      protocol: "1.3",
    });
    expect(() =>
      decodeDebuggerPage(
        {
          ...discovery,
          targets: [...discovery.targets, ...discovery.targets],
        },
        49152,
      ),
    ).toThrow("invalidDesktopPageContract");
    expect(() =>
      decodeDebuggerPage(
        {
          ...discovery,
          targets: Array.from({ length: 65 }, () => ({
            type: "background_page",
            url: "chrome-extension://ignored",
          })),
        },
        49152,
      ),
    ).toThrow("invalidDesktopTargetCount");
    expect(() =>
      decodeDebuggerPage(
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
      ),
    ).toThrow("unsafeDesktopEndpoint");
  });

  it("retries only transient renderer discovery readiness", () => {
    expect(
      isRetryableRendererDiscovery(new Error("invalidDesktopTargetCount")),
    ).toBe(true);
    expect(
      isRetryableRendererDiscovery(new Error("invalidDesktopPageContract")),
    ).toBe(true);
    expect(
      isRetryableRendererDiscovery(new Error("desktopDiscoveryFailed")),
    ).toBe(true);
    expect(
      isRetryableRendererDiscovery(new Error("unsupportedDesktopVersion")),
    ).toBe(false);
    expect(
      isRetryableRendererDiscovery(new Error("unsafeDesktopEndpoint")),
    ).toBe(false);
  });

  it("admits only the official signed application identity", () => {
    const signature =
      "Identifier=com.openai.codex\nTeamIdentifier=2DC432GLL2\nCDHash=753af97d4310c3c393348bdc0f28794e51b096ed\n";
    expect(
      parseMacosCodexApplicationIdentity({
        applicationVersion: "26.721.41059",
        bundleVersion: "5848",
        bundleIdentifier: "com.openai.codex",
        signature,
      }),
    ).toMatchObject({
      teamIdentifier: "2DC432GLL2",
      cdHash: "753af97d4310c3c393348bdc0f28794e51b096ed",
    });
    expect(() =>
      parseMacosCodexApplicationIdentity({
        applicationVersion: "26.721.41059",
        bundleVersion: "5848",
        bundleIdentifier: "com.openai.codex",
        signature: signature.replace("2DC432GLL2", "UNTRUSTED"),
      }),
    ).toThrow("untrustedCodexApplication");
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
    const selection = taskSelectionExpression('opaque"task');
    expect(selection).toContain(JSON.stringify('opaque"task'));
    expect(selection).not.toContain("textContent");
  });
});
