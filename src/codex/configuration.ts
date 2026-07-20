export const SANDALPHON_SETTINGS_SCHEMA_VERSION = 2;
export const SUPPORTED_CODEX_VERSION = "0.144.1";

export interface SandalphonSettings {
  readonly schemaVersion: typeof SANDALPHON_SETTINGS_SCHEMA_VERSION;
  readonly codexBinaryPath?: string;
  readonly selectedThreadId?: string;
  readonly desktopControl?: {
    readonly enabled: boolean;
  };
}

export type SettingsResult =
  | {
      readonly status: "ready";
      readonly settings: SandalphonSettings;
    }
  | {
      readonly status: "missing";
      readonly settings: SandalphonSettings;
    }
  | {
      readonly status: "migrated";
      readonly settings: SandalphonSettings;
    }
  | {
      readonly status: "invalid";
      readonly reason: "invalidSettings";
    }
  | {
      readonly status: "future";
      readonly reason: "newerSettings";
    };

export type BinaryCandidate =
  | {
      readonly path: string;
      readonly version: string;
      readonly executable: true;
    }
  | {
      readonly path: string;
      readonly executable: false;
    };

export type BinarySelection =
  | {
      readonly status: "ready";
      readonly path: string;
      readonly version: typeof SUPPORTED_CODEX_VERSION;
    }
  | {
      readonly status: "unavailable";
      readonly reason: "missingBinary" | "unsupportedVersion";
    };

export function parseSettings(value: unknown): SettingsResult {
  if (
    value === undefined ||
    value === null ||
    (isRecord(value) && Object.keys(value).length === 0)
  ) {
    return {
      status: "missing",
      settings: { schemaVersion: SANDALPHON_SETTINGS_SCHEMA_VERSION },
    };
  }

  if (!isRecord(value)) {
    return { status: "invalid", reason: "invalidSettings" };
  }

  const schemaVersion = value.schemaVersion;
  if (
    typeof schemaVersion === "number" &&
    schemaVersion > SANDALPHON_SETTINGS_SCHEMA_VERSION
  ) {
    return { status: "future", reason: "newerSettings" };
  }
  if (schemaVersion === 1) {
    if (
      !optionalNonEmptyString(value.codexBinaryPath) ||
      !optionalNonEmptyString(value.selectedThreadId)
    ) {
      return { status: "invalid", reason: "invalidSettings" };
    }
    return {
      status: "migrated",
      settings: {
        schemaVersion: SANDALPHON_SETTINGS_SCHEMA_VERSION,
        ...(typeof value.codexBinaryPath === "string"
          ? { codexBinaryPath: value.codexBinaryPath }
          : {}),
        ...(typeof value.selectedThreadId === "string"
          ? { selectedThreadId: value.selectedThreadId }
          : {}),
      },
    };
  }
  if (schemaVersion !== SANDALPHON_SETTINGS_SCHEMA_VERSION) {
    return { status: "invalid", reason: "invalidSettings" };
  }
  if (
    !optionalNonEmptyString(value.codexBinaryPath) ||
    !optionalNonEmptyString(value.selectedThreadId) ||
    !optionalDesktopControl(value.desktopControl)
  ) {
    return { status: "invalid", reason: "invalidSettings" };
  }

  return {
    status: "ready",
    settings: {
      schemaVersion,
      ...(typeof value.codexBinaryPath === "string"
        ? { codexBinaryPath: value.codexBinaryPath }
        : {}),
      ...(typeof value.selectedThreadId === "string"
        ? { selectedThreadId: value.selectedThreadId }
        : {}),
      ...(isRecord(value.desktopControl)
        ? {
            desktopControl: {
              enabled: value.desktopControl.enabled as boolean,
            },
          }
        : {}),
    },
  };
}

export function selectCodexBinary(
  candidates: readonly BinaryCandidate[],
): BinarySelection {
  const ordinary = candidates.filter(
    (candidate) =>
      candidate.executable && !isDesktopBundledCodex(candidate.path),
  );
  const supported = ordinary.find(
    (candidate) =>
      candidate.executable && candidate.version === SUPPORTED_CODEX_VERSION,
  );
  if (supported?.executable) {
    return {
      status: "ready",
      path: supported.path,
      version: SUPPORTED_CODEX_VERSION,
    };
  }
  return {
    status: "unavailable",
    reason: ordinary.length > 0 ? "unsupportedVersion" : "missingBinary",
  };
}

export function isDesktopBundledCodex(path: string): boolean {
  return path.includes(".app/Contents/Resources/codex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNonEmptyString(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

function optionalDesktopControl(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      Object.keys(value).length === 1 &&
      typeof value.enabled === "boolean")
  );
}
