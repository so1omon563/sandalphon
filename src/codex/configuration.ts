export const SANDALPHON_SETTINGS_SCHEMA_VERSION = 3;
export const MINIMUM_CODEX_VERSION = "0.144.1";
const SUPPORTED_CODEX_MAJOR = 0;
const LEGACY_DESKTOP_CONTROL_SCHEMA_VERSION = 2;

export interface SandalphonSettings {
  readonly schemaVersion: typeof SANDALPHON_SETTINGS_SCHEMA_VERSION;
  readonly codexBinaryPath?: string;
  readonly selectedThreadId?: string;
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
      readonly version: string;
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
  if (
    schemaVersion !== 1 &&
    schemaVersion !== LEGACY_DESKTOP_CONTROL_SCHEMA_VERSION &&
    schemaVersion !== SANDALPHON_SETTINGS_SCHEMA_VERSION
  ) {
    return { status: "invalid", reason: "invalidSettings" };
  }
  if (
    !optionalNonEmptyString(value.codexBinaryPath) ||
    !optionalNonEmptyString(value.selectedThreadId) ||
    (schemaVersion === LEGACY_DESKTOP_CONTROL_SCHEMA_VERSION &&
      !optionalDesktopControl(value.desktopControl))
  ) {
    return { status: "invalid", reason: "invalidSettings" };
  }

  return {
    status:
      schemaVersion === SANDALPHON_SETTINGS_SCHEMA_VERSION
        ? "ready"
        : "migrated",
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

export function selectCodexBinary(
  candidates: readonly BinaryCandidate[],
): BinarySelection {
  const ordinary = candidates.filter(
    (candidate) =>
      candidate.executable && !isDesktopBundledCodex(candidate.path),
  );
  const supported = ordinary.find(
    (candidate) =>
      candidate.executable && isSupportedCodexVersion(candidate.version),
  );
  if (supported?.executable) {
    return {
      status: "ready",
      path: supported.path,
      version: supported.version,
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

export function isSupportedCodexVersion(version: string): boolean {
  const candidate = parseVersion(version);
  const minimum = parseVersion(MINIMUM_CODEX_VERSION);
  if (!candidate || !minimum || candidate[0] !== SUPPORTED_CODEX_MAJOR) {
    return false;
  }
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] !== minimum[index]) {
      return candidate[index]! > minimum[index]!;
    }
  }
  return true;
}

function parseVersion(
  version: string,
): readonly [number, number, number] | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
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
