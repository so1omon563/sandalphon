import { Buffer } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

import {
  decodeAppServerChunk,
  discoverCandidatePaths,
  initializeCodexConnection,
  type CodexConnection,
} from "../src/codex/appServer.js";
import { MAX_APP_SERVER_LINE_LENGTH } from "../src/codex/jsonRpc.js";

describe("Codex app-server runtime", () => {
  it("discovers deterministic absolute ordinary CLI candidates", () => {
    expect(discoverCandidatePaths("/custom/bin:/opt/homebrew/bin")).toEqual([
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      "/custom/bin/codex",
    ]);
    expect(discoverCandidatePaths(undefined)).toEqual([
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
    ]);
  });

  it("frames app-server stdout by raw UTF-8 bytes", () => {
    const partial = decodeAppServerChunk(
      Buffer.alloc(0),
      Buffer.from('{"id":1,'),
    );
    expect(partial.lines).toEqual([]);
    const completed = decodeAppServerChunk(
      partial.pending,
      Buffer.from('"result":{}}\n\n'),
    );
    expect(completed).toEqual({
      pending: Buffer.alloc(0),
      lines: ['{"id":1,"result":{}}'],
    });

    const multibyte = Buffer.from(
      `${"é".repeat(Math.floor(MAX_APP_SERVER_LINE_LENGTH / 2) + 1)}\n`,
    );
    expect(() => decodeAppServerChunk(Buffer.alloc(0), multibyte)).toThrow(
      "appServerLineTooLarge",
    );
    expect(() =>
      decodeAppServerChunk(
        Buffer.alloc(MAX_APP_SERVER_LINE_LENGTH + 1),
        Buffer.alloc(0),
      ),
    ).toThrow("appServerLineTooLarge");
    expect(() =>
      decodeAppServerChunk(Buffer.alloc(0), Buffer.from([0xff, 0x0a])),
    ).toThrow("appServerInvalidMessage");
  });

  it("closes an app-server connection when initialization rejects", async () => {
    const close = vi.fn();
    const connection: CodexConnection = {
      request: vi.fn().mockRejectedValue(new Error("initialize failed")),
      notify: vi.fn(),
      respond: vi.fn(),
      onMessage: vi.fn(() => () => undefined),
      onClose: vi.fn(() => () => undefined),
      close,
    };
    await expect(initializeCodexConnection(connection)).rejects.toThrow(
      "initialize failed",
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
