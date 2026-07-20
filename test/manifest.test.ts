import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COMPOSABLE_ATTENTION_ACTION,
  COMPOSABLE_RESUME_ACTION,
  COMPOSABLE_SESSION_DIAL_ACTION,
  COMPOSABLE_STATUS_ACTION,
  FOUNDATION_STATUS_ACTION,
  MANAGED_CLASSIC15_ACTION,
  MANAGED_PLUS_ACTION,
  MANAGED_PLUS_ENCODER_ACTION,
} from "../src/foundation.js";

type Manifest = {
  Actions: Array<{
    Controllers?: string[];
    Encoder?: { layout?: string };
    Icon?: string;
    Name?: string;
    SupportedInKeyLogicActions?: boolean;
    SupportedInMultiActions?: boolean;
    UUID: string;
    VisibleInActionsList?: boolean;
  }>;
  CodePath: string;
  Nodejs?: {
    Version: string;
  };
  OS: Array<{
    MinimumVersion: string;
    Platform: string;
  }>;
  Profiles?: Array<{
    AutoInstall: boolean;
    DeviceType: number;
    DontAutoSwitchWhenInstalled: boolean;
    Name: string;
    Readonly: boolean;
  }>;
  PropertyInspectorPath?: string;
  SDKVersion: number;
  Software: {
    MinimumVersion: string;
  };
  UUID: string;
  Version: string;
};

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(
    `${repositoryRoot}/dev.so1omon.sandalphon.sdPlugin/manifest.json`,
    "utf8",
  ),
) as Manifest;
const propertyInspectorHtml = readFileSync(
  `${repositoryRoot}/dev.so1omon.sandalphon.sdPlugin/property-inspector/index.html`,
  "utf8",
);
const propertyInspectorScript = readFileSync(
  `${repositoryRoot}/dev.so1omon.sandalphon.sdPlugin/property-inspector/inspector.js`,
  "utf8",
);

describe("Stream Deck manifest", () => {
  it("uses Sandalphon's independent package identity", () => {
    expect(manifest.UUID).toBe("dev.so1omon.sandalphon");
    expect(manifest.Version).toBe("0.0.1.0");
    expect(manifest.CodePath).toBe("bin/plugin.js");
  });

  it("targets the supported Node 24 and Stream Deck 7.1 baseline", () => {
    expect(manifest.SDKVersion).toBe(3);
    expect(manifest.Nodejs?.Version).toBe("24");
    expect(manifest.Software.MinimumVersion).toBe("7.1");
    expect(manifest.OS).toEqual([
      {
        Platform: "mac",
        MinimumVersion: "13",
      },
    ]);
    expect(manifest.PropertyInspectorPath).toBe(
      "property-inspector/index.html",
    );
  });

  it("ships an explicit local desktop-control consent surface", () => {
    expect(propertyInspectorHtml).toContain("privileged local");
    expect(propertyInspectorHtml).toContain(
      "I understand and want desktop task selection",
    );
    expect(propertyInspectorScript).toContain("desktopControl.setEnabled");
    expect(propertyInspectorScript).toContain("ws://127.0.0.1:");
    expect(propertyInspectorScript).toContain("context: propertyInspectorUUID");
    expect(propertyInspectorScript).not.toContain("context: actionContext");
    expect(propertyInspectorScript).toContain("rendererTimeout");
    expect(propertyInspectorScript).toContain("endpointUnavailable");
    expect(propertyInspectorScript).toContain("targetSetRejected");
    expect(propertyInspectorScript).toContain("debuggerUrlRejected");
    expect(propertyInspectorScript).toContain("processRejected");
    expect(propertyInspectorScript).toContain("capabilityUnavailable");
    expect(propertyInspectorScript).toContain("taskSetRejected");
    expect(propertyInspectorScript).toContain("taskEntryRejected");
    expect(propertyInspectorScript).toContain("taskSelectionRejected");
    expect(propertyInspectorScript).not.toMatch(/https?:\/\//u);
  });

  it("keeps the foundation action out of automation containers", () => {
    const foundationAction = manifest.Actions.find(
      ({ UUID }) => UUID === FOUNDATION_STATUS_ACTION,
    );

    expect(foundationAction?.UUID).toBe(FOUNDATION_STATUS_ACTION);
    expect(foundationAction?.UUID.startsWith(`${manifest.UUID}.`)).toBe(true);
    expect(foundationAction?.SupportedInMultiActions).toBe(false);
    expect(foundationAction?.SupportedInKeyLogicActions).toBe(false);
  });

  it("exposes distinct self-contained daily-driver controls", () => {
    expect(manifest.Actions.map(({ UUID }) => UUID)).toEqual([
      COMPOSABLE_STATUS_ACTION,
      COMPOSABLE_RESUME_ACTION,
      COMPOSABLE_ATTENTION_ACTION,
      COMPOSABLE_SESSION_DIAL_ACTION,
      FOUNDATION_STATUS_ACTION,
      MANAGED_CLASSIC15_ACTION,
      MANAGED_PLUS_ACTION,
      MANAGED_PLUS_ENCODER_ACTION,
    ]);
    expect(manifest.Actions.slice(0, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          UUID: COMPOSABLE_STATUS_ACTION,
          Name: "Session Status",
          Icon: "imgs/actions/composable-status",
          Controllers: ["Keypad"],
        }),
        expect.objectContaining({
          UUID: COMPOSABLE_RESUME_ACTION,
          Name: "Resume Session",
          Icon: "imgs/actions/composable-resume",
          Controllers: ["Keypad"],
        }),
        expect.objectContaining({
          UUID: COMPOSABLE_ATTENTION_ACTION,
          Name: "Attention",
          Icon: "imgs/actions/composable-attention",
          Controllers: ["Keypad"],
        }),
      ]),
    );
    expect(manifest.Actions[3]).toMatchObject({
      UUID: COMPOSABLE_SESSION_DIAL_ACTION,
      Name: "Sessions",
      Icon: "imgs/actions/composable-session-dial",
      Controllers: ["Encoder"],
      Encoder: { layout: "layouts/plus-quarter.json" },
    });
    for (const composable of manifest.Actions.slice(0, 4)) {
      expect(composable.SupportedInMultiActions).toBe(false);
      expect(composable.SupportedInKeyLogicActions).toBe(false);
      expect(composable.VisibleInActionsList).toBeUndefined();
    }
  });

  it("separates hidden managed Classic and Plus action contracts", () => {
    expect(manifest.Actions[5]).toMatchObject({
      Controllers: ["Keypad"],
      SupportedInMultiActions: false,
      SupportedInKeyLogicActions: false,
      VisibleInActionsList: false,
    });
    expect(manifest.Actions[6]).toMatchObject({
      Controllers: ["Keypad"],
      SupportedInMultiActions: false,
      SupportedInKeyLogicActions: false,
      VisibleInActionsList: false,
    });
    expect(manifest.Actions[7]).toMatchObject({
      Controllers: ["Keypad", "Encoder"],
      Encoder: { layout: "$A1" },
      SupportedInMultiActions: false,
      SupportedInKeyLogicActions: false,
      VisibleInActionsList: false,
    });
  });

  it("bundles immutable reference-device profiles without surprise switching", () => {
    expect(manifest.Profiles).toEqual([
      {
        AutoInstall: true,
        DeviceType: 0,
        DontAutoSwitchWhenInstalled: true,
        Name: "profiles/Sandalphon Classic 15",
        Readonly: true,
      },
      {
        AutoInstall: true,
        DeviceType: 7,
        DontAutoSwitchWhenInstalled: true,
        Name: "profiles/Sandalphon Plus",
        Readonly: true,
      },
    ]);
  });
});
