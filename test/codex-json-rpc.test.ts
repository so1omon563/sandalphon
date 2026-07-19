import { describe, expect, it, vi } from "vitest";

import {
  JsonRpcPeer,
  MAX_APP_SERVER_LINE_LENGTH,
} from "../src/codex/jsonRpc.js";

describe("Codex JSON-RPC peer", () => {
  it("correlates responses and forwards server messages", async () => {
    const sent: string[] = [];
    const serverMessage = vi.fn();
    const peer = new JsonRpcPeer((line) => sent.push(line), serverMessage);
    const request = peer.request<{ ready: boolean }>("account/read", {});
    expect(JSON.parse(sent[0] ?? "")).toEqual({
      id: 1,
      method: "account/read",
      params: {},
    });
    peer.receive('{"id":1,"result":{"ready":true}}');
    await expect(request).resolves.toEqual({ ready: true });

    peer.receive('{"method":"turn/started","params":{"threadId":"t"}}');
    expect(serverMessage).toHaveBeenCalledWith({
      method: "turn/started",
      params: { threadId: "t" },
    });

    peer.receive(
      '{"id":"server-request","method":"item/fileChange/requestApproval","params":{}}',
    );
    expect(serverMessage).toHaveBeenLastCalledWith({
      id: "server-request",
      method: "item/fileChange/requestApproval",
      params: {},
    });

    peer.notify("initialized");
    peer.respond(7, { decision: "decline" });
    expect(sent.slice(-2).map((line): unknown => JSON.parse(line))).toEqual([
      { method: "initialized" },
      { id: 7, result: { decision: "decline" } },
    ]);
  });

  it("fails requests without exposing provider error content", async () => {
    const peer = new JsonRpcPeer(
      () => undefined,
      () => undefined,
    );
    const request = peer.request("thread/list", {});
    peer.receive(
      '{"id":1,"error":{"code":-1,"message":"sensitive provider detail"}}',
    );
    await expect(request).rejects.toThrow("appServerRequestFailed");
    peer.receive('{"id":99,"result":{}}');
  });

  it("accepts a bounded multi-megabyte thread resume response", async () => {
    const peer = new JsonRpcPeer(
      () => undefined,
      () => undefined,
    );
    const request = peer.request<{ initialTurnsPage: string }>(
      "thread/resume",
      {},
    );
    const initialTurnsPage = "x".repeat(6 * 1_048_576);
    peer.receive(JSON.stringify({ id: 1, result: { initialTurnsPage } }));
    const result = await request;
    expect(result.initialTurnsPage).toHaveLength(initialTurnsPage.length);
  });

  it("closes fail-closed for malformed, oversized, and closed traffic", async () => {
    const peer = new JsonRpcPeer(
      () => undefined,
      () => undefined,
    );
    const pending = peer.request("thread/list", {});
    peer.receive("not-json");
    expect(peer.closed).toBe(true);
    await expect(pending).rejects.toThrow("appServerInvalidMessage");
    await expect(peer.request("account/read", {})).rejects.toThrow(
      "appServerClosed",
    );
    expect(() => peer.notify("initialized")).toThrow("appServerClosed");
    expect(() => peer.respond(1, {})).toThrow("appServerClosed");
    peer.receive("{}");
    peer.close();

    const oversized = new JsonRpcPeer(
      () => undefined,
      () => undefined,
    );
    const oversizedPending = oversized.request("thread/list", {});
    oversized.receive("x".repeat(MAX_APP_SERVER_LINE_LENGTH + 1));
    expect(oversized.closed).toBe(true);
    await expect(oversizedPending).rejects.toThrow("appServerLineTooLarge");

    const incomplete = new JsonRpcPeer(
      () => undefined,
      () => undefined,
    );
    const incompletePending = incomplete.request("thread/resume", {});
    incomplete.receive('{"id":1}');
    await expect(incompletePending).rejects.toThrow("appServerInvalidMessage");

    const conflicting = new JsonRpcPeer(
      () => undefined,
      () => undefined,
    );
    const conflictingPending = conflicting.request("thread/list", {});
    conflicting.receive(
      '{"id":1,"result":{},"error":{"code":-1,"message":"error"}}',
    );
    await expect(conflictingPending).rejects.toThrow("appServerInvalidMessage");
  });
});
