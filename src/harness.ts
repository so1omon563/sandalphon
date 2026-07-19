import {
  advanceInvocation,
  createInvocationLedger,
  dispatchOffer,
  toSnapshot,
  type IntentResult,
  type InvocationLedger,
  type OfferInvocation,
} from "./domain/offers.js";
import {
  createCoreState,
  reduceCore,
  type CoreEvent,
} from "./domain/reducer.js";
import type { CoreState, SandalphonSnapshot } from "./domain/model.js";
import {
  present,
  rotatePreview,
  type PresentationFrame,
  type SurfaceRuntime,
} from "./presentation.js";

export class SimulatedCodex {
  #state: CoreState = createCoreState();
  #ledger: InvocationLedger = createInvocationLedger();
  readonly dispatched: OfferInvocation[] = [];

  get snapshot(): SandalphonSnapshot {
    return toSnapshot(this.#state, this.#ledger.claimedEffects);
  }

  receive(event: CoreEvent): SandalphonSnapshot {
    this.#state = reduceCore(this.#state, event);
    return this.snapshot;
  }

  invoke(invocation: OfferInvocation): IntentResult {
    const decision = dispatchOffer(this.#state, this.#ledger, invocation);
    this.#ledger = decision.ledger;
    if (decision.shouldDispatch) this.dispatched.push(invocation);
    return decision.result;
  }

  advance(
    invocationId: string,
    status: "pending" | "completed" | "failed" | "uncertain",
  ): IntentResult | undefined {
    this.#ledger = advanceInvocation(this.#ledger, invocationId, status);
    return this.#ledger.invocationResults[invocationId];
  }
}

export class SimulatedSurface {
  #runtime: SurfaceRuntime;
  #frame?: PresentationFrame;
  #pressed:
    { readonly controlId: string; readonly offerToken?: string } | undefined;

  constructor(runtime: SurfaceRuntime) {
    this.#runtime = runtime;
  }

  get runtime(): SurfaceRuntime {
    return this.#runtime;
  }

  get frame(): PresentationFrame | undefined {
    return this.#frame;
  }

  render(snapshot: SandalphonSnapshot): PresentationFrame {
    if (this.#frame && snapshot.revision < this.#frame.snapshotRevision) {
      return this.#frame;
    }
    this.#frame = present(snapshot, this.#runtime);
    return this.#frame;
  }

  keyDown(controlId: string): void {
    const control = this.#frame?.keyViews.find(({ id }) => id === controlId);
    this.#pressed = {
      controlId,
      ...(control?.offerToken ? { offerToken: control.offerToken } : {}),
    };
  }

  keyUp(controlId: string): string | undefined {
    const control = this.#frame?.keyViews.find(({ id }) => id === controlId);
    const currentToken = control?.offerToken;
    const token =
      this.#pressed?.controlId === controlId &&
      this.#pressed.offerToken === currentToken
        ? currentToken
        : undefined;
    this.#pressed = undefined;
    return token;
  }

  rotate(ticks: number, optionCount: number): void {
    this.#runtime = rotatePreview(this.#runtime, ticks, optionCount);
  }

  encoderPress(
    controlId: string,
  ): { readonly offerToken: string; readonly optionId: string } | undefined {
    const control = this.#frame?.encoderViews.find(
      ({ id }) => id === controlId,
    );
    const options = control?.optionIds;
    const optionId = options?.[this.#runtime.local.previewIndex];
    if (!control?.offerToken || !optionId) return undefined;
    return { offerToken: control.offerToken, optionId };
  }
}
