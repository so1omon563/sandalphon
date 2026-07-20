import type { SurfaceApplicationBoundary } from "./application.js";
import {
  createConfirmationState,
  reduceConfirmation,
  type ConfirmationState,
} from "./domain/confirmation.js";
import type {
  ActionKind,
  ActionOffer,
  PrimaryState,
  SandalphonSnapshot,
  SessionSnapshot,
} from "./domain/model.js";
import { segmentRenderableDetail } from "./detailText.js";
import { actionIcon, type KeyIcon } from "./keyIcons.js";
import {
  moveStreamDeckPlusChoice,
  paginateStreamDeckPlusDetail,
  type StreamDeckPlusDetailPage,
} from "./streamDeckPlus.js";

export type PlusApplicationBoundary = SurfaceApplicationBoundary;

export interface PlusKeyView {
  readonly index: number;
  readonly label: string;
  readonly enabled: boolean;
  readonly state: PrimaryState;
  readonly icon: KeyIcon;
}

export interface PlusEncoderView {
  readonly index: number;
  readonly title: string;
  readonly detail: string;
  readonly state: PrimaryState;
  readonly rotate: string;
  readonly press: string;
  readonly touch: string;
}

export interface PlusMvpFrame {
  readonly revision: number;
  readonly view: "home" | "session" | "request" | "unavailable";
  readonly keys: readonly PlusKeyView[];
  readonly encoders: readonly PlusEncoderView[];
}

interface PressCapture {
  readonly index: number;
  readonly revision: number;
}

interface ReviewContext {
  readonly detail: string;
  readonly pages: readonly StreamDeckPlusDetailPage[];
  readonly offers: Readonly<Partial<Record<ActionKind, ActionOffer>>>;
  readonly localAction: boolean;
}

export class PlusMvpSurface {
  readonly #application: PlusApplicationBoundary;
  readonly #listeners = new Set<(frame: PlusMvpFrame) => void>();
  readonly #exitListeners = new Set<() => void>();
  readonly #unsubscribe: () => void;
  #snapshot: SandalphonSnapshot;
  #view: PlusMvpFrame["view"] = "home";
  #revision = 0;
  #sessionPreview = 0;
  #actionPreview = 0;
  #reasoningPreview = 0;
  #detailPage = 0;
  #seenDetailPages = new Set<number>();
  #pressed: PressCapture | undefined;
  #review: ReviewContext | undefined;
  #confirmation: ConfirmationState = createConfirmationState();
  #confirmationKind: ActionKind | undefined;
  #invocationSequence = 0;

  constructor(application: PlusApplicationBoundary) {
    this.#application = application;
    this.#snapshot = application.snapshot;
    this.#unsubscribe = application.onSnapshot((snapshot) => {
      const priorRevision = this.#snapshot.revision;
      this.#snapshot = snapshot;
      this.#syncPreviews();
      if (snapshot.revision !== priorRevision) {
        this.#invalidateConfirmation();
        if (
          this.#view === "request" &&
          !this.#selectedSession()?.pendingRequests.length &&
          !this.#review?.localAction
        ) {
          this.#review = undefined;
          this.#view = "home";
        }
        this.#advanceFrame();
      } else {
        this.#emit();
      }
    });
    this.#syncPreviews();
  }

  get frame(): PlusMvpFrame {
    const selected = this.#selectedSession();
    const state = selected?.primaryState ?? "unavailable";
    const view =
      this.#snapshot.integration.phase === "ready" && selected
        ? this.#view
        : "unavailable";
    return {
      revision: this.#revision,
      view,
      keys: this.#keyViews(view, selected, state),
      encoders: this.#encoderViews(view, selected, state),
    };
  }

  onFrame(listener: (frame: PlusMvpFrame) => void): () => void {
    this.#listeners.add(listener);
    listener(this.frame);
    return () => this.#listeners.delete(listener);
  }

  onExit(listener: () => void): () => void {
    this.#exitListeners.add(listener);
    return () => this.#exitListeners.delete(listener);
  }

  dispose(): void {
    this.#unsubscribe();
    this.#listeners.clear();
    this.#exitListeners.clear();
  }

  invalidatePhysicalInput(): void {
    this.#review = undefined;
    this.#view = "home";
    this.#invalidateConfirmation();
    this.#advanceFrame();
  }

  keyDown(index: number, now: number): void {
    const frame = this.frame;
    if (!frame.keys[index]?.enabled) return;
    if (index === 7) {
      this.#pressed = undefined;
      for (const listener of this.#exitListeners) listener();
      return;
    }
    if (frame.view === "request" && [3, 5, 6].includes(index)) {
      void this.#decisionDown(index, now);
      return;
    }
    this.#pressed = { index, revision: frame.revision };
  }

  async keyUp(index: number, now: number): Promise<void> {
    if (this.#confirmation.phase === "holding") {
      const transition = reduceConfirmation(this.#confirmation, {
        type: "confirmUp",
        now,
      });
      this.#confirmation = transition.state;
      if (transition.dispatch) await this.#dispatchConfirmation();
      this.#advanceFrame();
      return;
    }
    const capture = this.#pressed;
    this.#pressed = undefined;
    if (
      !capture ||
      capture.index !== index ||
      capture.revision !== this.frame.revision
    ) {
      return;
    }
    await this.#activateKey(index, now);
  }

  async timeAdvanced(now: number): Promise<void> {
    const transition = reduceConfirmation(this.#confirmation, {
      type: "timeAdvanced",
      now,
    });
    this.#confirmation = transition.state;
    if (transition.dispatch) await this.#dispatchConfirmation();
    if (transition.state.phase !== "idle") this.#emit();
  }

  rotateEncoder(
    index: number,
    ticks: number,
    pressed: boolean,
    now: number,
  ): void {
    if (pressed || ticks === 0) return;
    const selected = this.#selectedSession();
    if (!selected) return;
    if (this.frame.view === "home" && (index === 2 || index === 3)) {
      const sessions =
        index === 3 ? this.#attentionSessions() : this.#snapshot.sessions;
      const current =
        index === 3 ? this.#attentionPreviewIndex() : this.#sessionPreview;
      const next = moveStreamDeckPlusChoice(
        current,
        ticks,
        sessions.length,
        false,
      );
      if (index === 3) {
        const target = sessions[next];
        this.#sessionPreview = target
          ? this.#snapshot.sessions.findIndex(({ id }) => id === target.id)
          : this.#sessionPreview;
      } else {
        this.#sessionPreview = next;
      }
      this.#advanceFrame();
      return;
    }
    if (this.frame.view === "session" && index === 1) {
      this.#actionPreview = moveStreamDeckPlusChoice(
        this.#actionPreview,
        ticks,
        this.#secondaryCatalog(selected).length,
        false,
      );
      this.#advanceFrame();
      return;
    }
    if (this.frame.view === "session" && index === 2) {
      const options = this.#reasoningOffer(selected)?.optionIds ?? [];
      this.#reasoningPreview = moveStreamDeckPlusChoice(
        this.#reasoningPreview,
        ticks,
        options.length,
        false,
      );
      this.#advanceFrame();
      return;
    }
    if (this.frame.view === "request" && index === 3 && this.#review) {
      const next = moveStreamDeckPlusChoice(
        this.#detailPage,
        ticks,
        this.#review.pages.length,
        false,
      );
      if (next === this.#detailPage) return;
      this.#invalidateConfirmation();
      this.#detailPage = next;
      this.#seenDetailPages.add(next);
      this.#advanceFrame();
      this.#armAutomaticDecision(now);
    }
  }

  async pressEncoder(index: number, now: number): Promise<void> {
    const selected = this.#selectedSession();
    if (!selected) return;
    if (this.frame.view === "home" && (index === 2 || index === 3)) {
      const target =
        index === 3
          ? this.#attentionSessions()[this.#attentionPreviewIndex()]
          : this.#snapshot.sessions[this.#sessionPreview];
      if (target) await this.#application.selectSession(target.id);
      return;
    }
    if (this.frame.view === "session" && index === 1) {
      const offer = this.#secondaryCatalog(selected)[this.#actionPreview];
      if (offer) await this.#activateOffer(offer, now);
      return;
    }
    if (this.frame.view === "session" && index === 2) {
      const offer = this.#reasoningOffer(selected);
      const optionId = offer?.optionIds?.[this.#reasoningPreview];
      if (offer?.offerToken && optionId) {
        await this.#invoke(offer.offerToken, optionId);
      }
      return;
    }
    if (this.frame.view === "request" && index === 3 && this.#review) {
      const unread = this.#review.pages.find(
        ({ index: pageIndex }) => !this.#seenDetailPages.has(pageIndex),
      );
      this.#detailPage = unread?.index ?? 0;
      this.#seenDetailPages.add(this.#detailPage);
      this.#invalidateConfirmation();
      this.#advanceFrame();
      this.#armAutomaticDecision(now);
    }
  }

  touchEncoder(index: number, hold: boolean): void {
    if (hold) return;
    const selected = this.#selectedSession();
    if (
      this.frame.view === "home" &&
      index === 2 &&
      selected &&
      this.#hasDetails(selected)
    ) {
      this.#view = "session";
      this.#advanceFrame();
    }
  }

  async #activateKey(index: number, now: number): Promise<void> {
    const selected = this.#selectedSession();
    if (!selected) return;
    if (index === 4) {
      this.#view = "home";
      this.#review = undefined;
      this.#invalidateConfirmation();
      this.#advanceFrame();
      return;
    }
    if (this.frame.view === "home") {
      if (index === 1 || index === 6) {
        this.#view = "session";
        this.#advanceFrame();
      } else if (index === 2) {
        const offer = this.#primaryOffer(selected);
        if (offer) await this.#activateOffer(offer, now);
      } else if (index === 3 && selected.pendingRequests.length > 0) {
        this.#openProviderReview(now);
      }
      return;
    }
    if (this.frame.view === "session" && index === 2) {
      const offer = this.#primaryOffer(selected);
      if (offer) await this.#activateOffer(offer, now);
    }
  }

  async #activateOffer(offer: ActionOffer, now: number): Promise<void> {
    if (offer.state !== "available" || !offer.offerToken) return;
    if (
      offer.safety.confirmation === "reviewPress" ||
      offer.safety.confirmation === "reviewHold"
    ) {
      const detail =
        offer.kind === "CancelRun"
          ? "Interrupt active Codex work · The current turn will stop · No other thread is changed"
          : "Start a new attempt · Prior effects are not replayed · Review the failed result in Codex";
      const pagination = paginateStreamDeckPlusDetail(detail);
      if (!pagination.available) return;
      this.#review = {
        detail,
        pages: pagination.pages,
        offers: { [offer.kind]: offer },
        localAction: true,
      };
      this.#detailPage = 0;
      this.#seenDetailPages = new Set([0]);
      this.#view = "request";
      this.#advanceFrame();
      this.#arm(offer.kind, offer, offer.safety.inspection, now);
      return;
    }
    await this.#invoke(offer.offerToken);
  }

  #openProviderReview(now: number): void {
    const selected = this.#selectedSession();
    const detail = this.#application.reviewDetail;
    if (!selected || !detail) return;
    const pagination = paginateStreamDeckPlusDetail(detail.text);
    if (!pagination.available) return;
    this.#review = {
      detail: detail.text,
      pages: pagination.pages,
      offers: Object.fromEntries(
        selected.actionOffers
          .filter(({ kind }) =>
            ["ApproveRequest", "RejectRequest", "CancelRequest"].includes(kind),
          )
          .map((offer) => [offer.kind, offer]),
      ),
      localAction: false,
    };
    this.#detailPage = 0;
    this.#seenDetailPages = new Set([0]);
    this.#view = "request";
    this.#advanceFrame();
    this.#armAutomaticDecision(now);
  }

  #armAutomaticDecision(now: number): void {
    if (!this.#review) return;
    const onlyOffer = Object.values(this.#review.offers).filter(
      (offer): offer is ActionOffer => offer !== undefined,
    );
    if (this.#review.localAction && onlyOffer[0]) {
      this.#arm(
        onlyOffer[0].kind,
        onlyOffer[0],
        onlyOffer[0].safety.inspection,
        now,
      );
      return;
    }
    if (this.#seenDetailPages.size === this.#review.pages.length) {
      const approve = this.#review.offers.ApproveRequest;
      if (approve?.state === "available") {
        this.#arm("ApproveRequest", approve, "complete", now);
      }
    }
  }

  async #decisionDown(index: number, now: number): Promise<void> {
    const kind = decisionKind(index, this.#review);
    const offer = kind && this.#review?.offers[kind];
    if (!kind || !offer?.offerToken || offer.state !== "available") return;
    if (
      this.#confirmationKind !== kind ||
      this.#confirmation.phase !== "armed"
    ) {
      this.#invalidateConfirmation();
      this.#advanceFrame();
      this.#arm(kind, offer, offer.safety.inspection, now, false);
      return;
    }
    const transition = reduceConfirmation(this.#confirmation, {
      type: "confirmDown",
      offerToken: offer.offerToken,
      frameRevision: this.#revision,
      now,
    });
    this.#confirmation = transition.state;
    if (transition.dispatch) await this.#dispatchConfirmation();
    this.#emit();
  }

  #arm(
    kind: ActionKind,
    offer: ActionOffer,
    inspection: "none" | "target" | "complete",
    now: number,
    advance = true,
  ): void {
    if (!offer.offerToken) return;
    if (advance) this.#advanceFrame();
    const reviewing = reduceConfirmation(createConfirmationState(), {
      type: "beginReview",
      offerToken: offer.offerToken,
      frameRevision: this.#revision,
      confirmation: offer.safety.confirmation,
      requiredInspection: offer.safety.inspection,
    }).state;
    this.#confirmation = reduceConfirmation(reviewing, {
      type: "inspected",
      level: inspection,
      now,
    }).state;
    this.#confirmationKind = kind;
    this.#emit();
  }

  async #dispatchConfirmation(): Promise<void> {
    if (this.#confirmation.phase !== "dispatched") return;
    await this.#invoke(this.#confirmation.offerToken);
    this.#review = undefined;
    this.#view = "home";
    this.#invalidateConfirmation();
    this.#advanceFrame();
  }

  async #invoke(offerToken: string, optionId?: string): Promise<void> {
    this.#invocationSequence += 1;
    await this.#application.invoke({
      invocationId: `plus:${this.#invocationSequence}`,
      offerToken,
      ...(optionId ? { optionId } : {}),
    });
  }

  #invalidateConfirmation(): void {
    this.#confirmation = reduceConfirmation(this.#confirmation, {
      type: "invalidate",
    }).state;
    this.#confirmationKind = undefined;
  }

  #syncPreviews(): void {
    const selectedIndex = this.#snapshot.sessions.findIndex(
      ({ id }) => id === this.#snapshot.selectedSessionId,
    );
    if (selectedIndex >= 0) this.#sessionPreview = selectedIndex;
    const selected = this.#selectedSession();
    const reasoning = selected?.nextTurnSettings;
    if (reasoning) {
      const optionIndex = reasoning.reasoningOptions.indexOf(
        reasoning.reasoningEffort,
      );
      this.#reasoningPreview = optionIndex >= 0 ? optionIndex : 0;
    }
    this.#actionPreview = moveStreamDeckPlusChoice(
      this.#actionPreview,
      0,
      selected ? this.#secondaryCatalog(selected).length : 0,
      false,
    );
  }

  #selectedSession(): SessionSnapshot | undefined {
    return this.#snapshot.sessions.find(
      ({ id }) => id === this.#snapshot.selectedSessionId,
    );
  }

  #primaryOffer(selected: SessionSnapshot): ActionOffer | undefined {
    for (const kind of [
      "CancelRun",
      "ResumeSession",
      "RetryWork",
      "AcknowledgeResult",
      "Inspect",
    ] as const) {
      const offer = selected.actionOffers.find(
        (candidate) =>
          candidate.kind === kind && candidate.state === "available",
      );
      if (offer) return offer;
    }
    return undefined;
  }

  #reasoningOffer(selected: SessionSnapshot): ActionOffer | undefined {
    return selected.actionOffers.find(
      ({ kind, state }) =>
        kind === "ChangeNextTurnOptions" && state === "available",
    );
  }

  #catalog(selected: SessionSnapshot): readonly ActionOffer[] {
    return selected.actionOffers.filter(
      ({ kind, state }) =>
        state === "available" && kind !== "ChangeNextTurnOptions",
    );
  }

  #secondaryCatalog(selected: SessionSnapshot): readonly ActionOffer[] {
    const primary = this.#primaryOffer(selected);
    return this.#catalog(selected).filter(
      ({ offerToken }) => offerToken !== primary?.offerToken,
    );
  }

  #hasDetails(selected: SessionSnapshot): boolean {
    return (
      this.#secondaryCatalog(selected).length > 0 ||
      this.#reasoningOffer(selected) !== undefined ||
      selected.activity !== "none"
    );
  }

  #attentionSessions(): readonly SessionSnapshot[] {
    return this.#snapshot.sessions.filter(
      ({ attention }) => attention.length > 0,
    );
  }

  #attentionPreviewIndex(): number {
    const preview = this.#snapshot.sessions[this.#sessionPreview];
    const index = this.#attentionSessions().findIndex(
      ({ id }) => id === preview?.id,
    );
    return index >= 0 ? index : 0;
  }

  #keyViews(
    view: PlusMvpFrame["view"],
    selected: SessionSnapshot | undefined,
    state: PrimaryState,
  ): PlusKeyView[] {
    if (view === "unavailable") {
      return keyLabels(
        ["Offline", "", "", "", "Home", "", "", "Exit"],
        state,
        [4, 7],
      );
    }
    if (!selected) return keyLabels(Array(8).fill(""), state, []);
    if (view === "request") {
      const review = this.#review;
      const labels = [
        compactLabel(selected.name, 12),
        "Request",
        review ? `Page ${this.#detailPage + 1}` : "Review",
        decisionLabel("ApproveRequest", review, this.#confirmationKind),
        "Back",
        decisionLabel("CancelRequest", review, this.#confirmationKind),
        decisionLabel("RejectRequest", review, this.#confirmationKind),
        "Exit",
      ];
      const enabled = [0, 4, 7];
      for (const [index, kind] of [
        [3, "ApproveRequest"],
        [5, review?.offers.CancelRun ? "CancelRun" : "CancelRequest"],
        [6, review?.offers.RetryWork ? "RetryWork" : "RejectRequest"],
      ] as const) {
        if (review?.offers[kind]?.state === "available") enabled.push(index);
      }
      return withSessionIdentity(keyLabels(labels, state, enabled));
    }
    const primary = this.#primaryOffer(selected);
    const hasDetails = this.#hasDetails(selected);
    const common = [
      compactLabel(selected.name, 12),
      "",
      primary ? actionLabel(primary.kind) : "",
      selected.pendingRequests.length > 0 ? "Review request" : "",
      view === "session" ? "Back" : "",
      "",
      view === "home" && hasDetails ? "Details" : "",
      "Exit",
    ];
    return withSessionIdentity(
      keyLabels(common, state, [
        ...(primary ? [2] : []),
        ...(selected.pendingRequests.length > 0 ? [3] : []),
        ...(view === "session" ? [4] : []),
        ...(view === "home" && hasDetails ? [6] : []),
        7,
      ]),
    );
  }

  #encoderViews(
    view: PlusMvpFrame["view"],
    selected: SessionSnapshot | undefined,
    state: PrimaryState,
  ): PlusEncoderView[] {
    if (view === "unavailable" || !selected) {
      const reason = this.#snapshot.integration.reason ?? "starting";
      return [
        encoder(0, "Offline", reason, "unavailable", "", "", ""),
        blankEncoder(1),
        blankEncoder(2),
        blankEncoder(3),
      ];
    }
    if (view === "request" && this.#review) {
      const page = this.#review.pages[this.#detailPage];
      return Array.from({ length: 4 }, (_, index) => {
        const lines = page?.cells[index]?.lines ?? [""];
        return {
          index,
          title: lines[0] ?? "",
          detail: lines[1] ?? "",
          state,
          rotate: index === 3 ? "Review pages" : "",
          press: index === 3 ? "First unread" : "",
          touch: "Inspect only",
        };
      });
    }
    if (view === "home") {
      const preview = this.#snapshot.sessions[this.#sessionPreview] ?? selected;
      const previewIsSelected = preview.id === selected.id;
      const attention = this.#attentionSessions();
      return [
        blankEncoder(0),
        blankEncoder(1),
        encoder(
          2,
          previewIsSelected ? "Sessions" : "Preview session",
          `${compactLabel(preview.name, 18)} · ${this.#sessionPreview + 1}/${this.#snapshot.sessions.length}`,
          preview.primaryState,
          this.#snapshot.sessions.length > 1 ? "Preview" : "",
          previewIsSelected ? "" : "Select",
          "Open",
        ),
        attention.length > 0
          ? encoder(
              3,
              "Attention",
              `${attention.length} pending`,
              state,
              attention.length > 1 ? "Preview" : "",
              "Select",
              "Open",
            )
          : blankEncoder(3),
      ];
    }
    const catalog = this.#secondaryCatalog(selected);
    const action = catalog[this.#actionPreview];
    const reasoning = this.#reasoningOffer(selected);
    const option = reasoning?.optionIds?.[this.#reasoningPreview];
    return [
      blankEncoder(0),
      action
        ? encoder(
            1,
            "Actions",
            actionLabel(action.kind),
            state,
            catalog.length > 1 ? "Preview" : "",
            "Activate",
            "Focus",
          )
        : blankEncoder(1),
      reasoning
        ? encoder(
            2,
            option === selected.nextTurnSettings.reasoningEffort
              ? "Reasoning"
              : "Preview reasoning",
            option ?? selected.nextTurnSettings.reasoningEffort,
            state,
            (reasoning.optionIds?.length ?? 0) > 1 ? "Preview" : "",
            "Commit",
            "Focus",
          )
        : blankEncoder(2),
      selected.activity !== "none"
        ? encoder(
            3,
            "Activity",
            activityLabel(selected.activity),
            state,
            "",
            "",
            "Focus",
          )
        : blankEncoder(3),
    ];
  }

  #advanceFrame(): void {
    this.#revision += 1;
    this.#pressed = undefined;
    this.#emit();
  }

  #emit(): void {
    const frame = this.frame;
    for (const listener of this.#listeners) listener(frame);
  }
}

export function compactLabel(value: string, maximum: number): string {
  const graphemes = segmentRenderableDetail(value.trim());
  if (!graphemes || graphemes.length === 0) return "Codex thread";
  return graphemes.slice(0, maximum).join("");
}

function keyLabels(
  labels: readonly string[],
  state: PrimaryState,
  enabled: readonly number[],
  stateKeys: readonly number[] = [0],
): PlusKeyView[] {
  return labels.map((label, index) => ({
    index,
    label,
    enabled: enabled.includes(index),
    state,
    icon: stateKeys.includes(index) ? "state" : actionIcon(label),
  }));
}

function withSessionIdentity(keys: PlusKeyView[]): PlusKeyView[] {
  const selected = keys[0];
  if (selected) keys[0] = { ...selected, icon: "session" };
  return keys;
}

function encoder(
  index: number,
  title: string,
  detail: string,
  state: PrimaryState,
  rotate: string,
  press: string,
  touch: string,
): PlusEncoderView {
  return { index, title, detail, state, rotate, press, touch };
}

function blankEncoder(index: number): PlusEncoderView {
  return encoder(index, "", "", "idle", "", "", "");
}

function actionLabel(kind: ActionKind): string {
  const labels: Record<ActionKind, string> = {
    ResumeSession: "Resume",
    Inspect: "Inspect",
    AcknowledgeResult: "Acknowledge",
    ApproveRequest: "Approve",
    RejectRequest: "Reject",
    CancelRequest: "Cancel request",
    CancelRun: "Cancel run",
    RetryWork: "Retry",
    ChangeNextTurnOptions: "Reasoning",
  };
  return labels[kind];
}

function activityLabel(activity: SessionSnapshot["activity"]): string {
  if (activity === "none") return "Ready";
  return compactLabel(activity.replace(/([A-Z])/g, " $1"), 18);
}

function decisionKind(
  index: number,
  review: ReviewContext | undefined,
): ActionKind | undefined {
  if (!review) return undefined;
  if (index === 3) {
    return review.offers.RetryWork ? "RetryWork" : "ApproveRequest";
  }
  if (index === 5) {
    return review.offers.CancelRun ? "CancelRun" : "CancelRequest";
  }
  return index === 6 ? "RejectRequest" : undefined;
}

function decisionLabel(
  kind: "ApproveRequest" | "CancelRequest" | "RejectRequest",
  review: ReviewContext | undefined,
  armed: ActionKind | undefined,
): string {
  const actual =
    kind === "ApproveRequest" && review?.offers.RetryWork
      ? "RetryWork"
      : kind === "CancelRequest" && review?.offers.CancelRun
        ? "CancelRun"
        : kind;
  const offer = review?.offers[actual];
  if (!offer || offer.state !== "available") return "";
  const label = actionLabel(actual);
  if (armed !== actual) return label;
  return offer.safety.confirmation === "reviewHold"
    ? `Hold ${label.toLowerCase()}`
    : `Confirm ${label.toLowerCase()}`;
}
