import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FOUNDATION_STATUS_ACTION,
  MANAGED_PLUS_ACTION,
  MANAGED_PLUS_ENCODER_ACTION,
} from "../src/foundation.js";

type Manifest = {
  Actions: Array<{
    Controllers?: string[];
    Encoder?: { layout?: string };
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
  });

  it("keeps the foundation action out of automation containers", () => {
    const [foundationAction] = manifest.Actions;

    expect(foundationAction?.UUID).toBe(FOUNDATION_STATUS_ACTION);
    expect(foundationAction?.UUID.startsWith(`${manifest.UUID}.`)).toBe(true);
    expect(foundationAction?.SupportedInMultiActions).toBe(false);
    expect(foundationAction?.SupportedInKeyLogicActions).toBe(false);
  });

  it("separates managed Plus key and encoder action contracts", () => {
    expect(manifest.Actions.map(({ UUID }) => UUID)).toEqual([
      FOUNDATION_STATUS_ACTION,
      MANAGED_PLUS_ACTION,
      MANAGED_PLUS_ENCODER_ACTION,
    ]);
    expect(manifest.Actions[1]).toMatchObject({
      Controllers: ["Keypad"],
      SupportedInMultiActions: false,
      SupportedInKeyLogicActions: false,
      VisibleInActionsList: false,
    });
    expect(manifest.Actions[2]).toMatchObject({
      Controllers: ["Keypad", "Encoder"],
      Encoder: { layout: "$A1" },
      SupportedInMultiActions: false,
      SupportedInKeyLogicActions: false,
      VisibleInActionsList: false,
    });
  });

  it("bundles one immutable Stream Deck + profile without surprise switching", () => {
    expect(manifest.Profiles).toEqual([
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
