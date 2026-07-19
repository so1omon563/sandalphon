// thread/resume includes an initial page of turn history in one JSON-RPC line.
// Keep a finite local-process boundary while allowing realistic long threads.
export const MAX_APP_SERVER_LINE_LENGTH = 16 * 1_048_576;

export type RequestId = string | number;

export interface RpcMessage {
  readonly id?: RequestId;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
  };
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

export class JsonRpcPeer {
  readonly #sendLine: (line: string) => void;
  readonly #onServerMessage: (message: RpcMessage) => void;
  readonly #pending = new Map<number, PendingRequest>();
  #nextId = 1;
  #closed = false;

  constructor(
    sendLine: (line: string) => void,
    onServerMessage: (message: RpcMessage) => void,
  ) {
    this.#sendLine = sendLine;
    this.#onServerMessage = onServerMessage;
  }

  get closed(): boolean {
    return this.#closed;
  }

  request<T>(method: string, params: unknown): Promise<T> {
    if (this.#closed) return Promise.reject(new Error("appServerClosed"));
    const id = this.#nextId++;
    const promise = new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
    this.#send({ id, method, params });
    return promise;
  }

  notify(method: string): void {
    if (this.#closed) throw new Error("appServerClosed");
    this.#send({ method });
  }

  respond(id: RequestId, result: unknown): void {
    if (this.#closed) throw new Error("appServerClosed");
    this.#send({ id, result });
  }

  receive(line: string): void {
    if (this.#closed) return;
    if (line.length > MAX_APP_SERVER_LINE_LENGTH) {
      this.close(new Error("appServerLineTooLarge"));
      return;
    }

    let message: RpcMessage;
    try {
      const value: unknown = JSON.parse(line);
      if (!isRecord(value)) throw new Error("appServerInvalidMessage");
      message = value;
    } catch {
      this.close(new Error("appServerInvalidMessage"));
      return;
    }

    if (typeof message.method === "string") {
      this.#onServerMessage(message);
      return;
    }
    if (message.method !== undefined || typeof message.id !== "number") {
      this.close(new Error("appServerInvalidMessage"));
      return;
    }

    const hasResult = Object.hasOwn(message, "result");
    const hasError = Object.hasOwn(message, "error");
    if (
      hasResult === hasError ||
      (hasError &&
        (!isRecord(message.error) ||
          typeof message.error.code !== "number" ||
          typeof message.error.message !== "string"))
    ) {
      this.close(new Error("appServerInvalidMessage"));
      return;
    }

    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error("appServerRequestFailed"));
    } else {
      pending.resolve(message.result);
    }
  }

  close(error = new Error("appServerClosed")): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  #send(message: RpcMessage): void {
    this.#sendLine(`${JSON.stringify(message)}\n`);
  }
}

function isRecord(
  value: unknown,
): value is RpcMessage & Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
