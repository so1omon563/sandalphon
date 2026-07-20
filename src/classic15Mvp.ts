import type { SurfaceApplicationBoundary } from "./application.js";
import {
  CLASSIC15_ANCHORS,
  moveClassic15Choice,
  paginateClassic15Detail,
  type Classic15DetailPage,
} from "./classic15.js";
import {
  createConfirmationState,
  reduceConfirmation,
  type ConfirmationState,
} from "./domain/confirmation.js";
import type {
  ActionKind,
  ActionOffer,
  InspectionLevel,
  PrimaryState,
  SandalphonSnapshot,
  SessionSnapshot,
} from "./domain/model.js";
import { actionIcon, type KeyIcon } from "./keyIcons.js";
import { compactLabel } from "./plusMvp.js";

export interface Classic15KeyView {
  readonly index: number;
  readonly label: string;
  readonly lines?: readonly string[];
  readonly enabled: boolean;
  readonly state: PrimaryState;
  readonly icon: KeyIcon;
}

export interface Classic15MvpFrame {
  readonly revision: number;
  readonly view: "home" | "session" | "choice" | "request" | "unavailable";
  readonly keys: readonly Classic15KeyView[];
}

type RosterMode = "Priority" | "Recent" | "Favorites" | "Custom";
type ChoiceContext =
  | { readonly kind: "roster"; readonly options: readonly RosterMode[] }
  | {
      readonly kind: "reasoning";
      readonly offer: ActionOffer;
      readonly options: readonly string[];
    };

interface PressCapture {
  readonly index: number;
  readonly revision: number;
}

interface ReviewContext {
  readonly pages: readonly Classic15DetailPage[];
  readonly inspection: InspectionLevel;
  readonly offers: Readonly<Partial<Record<ActionKind, ActionOffer>>>;
  readonly localAction: boolean;
}

const ROSTER_MODES: readonly RosterMode[] = [
  "Priority",
  "Recent",
  "Favorites",
  "Custom",
];

const DETAIL_KEYS = [1, 2, 3, 4, 6, 8] as const;
const ROSTER_PAGE_SIZE = 4;

export class Classic15MvpSurface {
  readonly #application: SurfaceApplicationBoundary;
  readonly #listeners = new Set<(frame: Classic15MvpFrame) => void>();
  readonly #exitListeners = new Set<() => void>();
  readonly #unsubscribe: () => void;
  #snapshot: SandalphonSnapshot;
  #view: Classic15MvpFrame["view"] = "home";
  #revision = 0;
  #rosterMode: RosterMode = "Priority";
  #attentionRoster = false;
  #rosterPage = 0;
  #choice: ChoiceContext | undefined;
  #choicePreview = 0;
  #detailPage = 0;
  #seenDetailPages = new Set<number>();
  #review: ReviewContext | undefined;
  #pressed: PressCapture | undefined;
  #confirmation: ConfirmationState = createConfirmationState();
  #confirmationKind: ActionKind | undefined;
  #invocationSequence = 0;

  constructor(application: SurfaceApplicationBoundary) {
    this.#application = application;
    this.#snapshot = application.snapshot;
    this.#unsubscribe = application.onSnapshot((snapshot) => {
      const priorRevision = this.#snapshot.revision;
      this.#snapshot = snapshot;
      this.#boundPages();
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
  }

  get frame(): Classic15MvpFrame {
    const selected = this.#selectedSession();
    const view =
      this.#snapshot.integration.phase === "ready" && selected
        ? this.#view
        : "unavailable";
    return {
      revision: this.#revision,
      view,
      keys: this.#keyViews(view, selected),
    };
  }

  onFrame(listener: (frame: Classic15MvpFrame) => void): () => void {
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
    this.#view = "home";
    this.#attentionRoster = false;
    this.#review = undefined;
    this.#choice = undefined;
    this.#invalidateConfirmation();
    this.#advanceFrame();
  }

  keyDown(index: number, now: number): void {
    const frame = this.frame;
    if (!frame.keys[index]?.enabled) return;
    if (index === CLASSIC15_ANCHORS.exit) {
      this.#pressed = undefined;
      for (const listener of this.#exitListeners) listener();
      return;
    }
    if (
      frame.view === "request" &&
      [5, 7, 9].includes(index) &&
      this.#decisionKind(index) !== "Inspect"
    ) {
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

  async #activateKey(index: number, now: number): Promise<void> {
    if (index === CLASSIC15_ANCHORS.homeOrBack) {
      this.#view = this.#view === "home" ? "home" : "session";
      this.#review = undefined;
      this.#choice = undefined;
      this.#invalidateConfirmation();
      this.#advanceFrame();
      return;
    }
    const selected = this.#selectedSession();
    if (!selected) return;
    if (this.frame.view === "home") await this.#activateHome(index, now);
    else if (this.frame.view === "session")
      await this.#activateSession(index, selected, now);
    else if (this.frame.view === "choice") await this.#activateChoice(index);
    else if (this.frame.view === "request")
      await this.#activateRequest(index, now);
  }

  async #activateHome(index: number, now: number): Promise<void> {
    if (index === 0) {
      this.#attentionRoster = false;
      this.#view = "session";
      this.#advanceFrame();
      return;
    }
    if (index >= 1 && index <= 8) {
      const target = this.#rosterPageItems()[index - 1];
      if (target) await this.#application.selectSession(target.id);
      return;
    }
    if (index === 9) {
      const selected = this.#selectedSession();
      if (selected?.pendingRequests.length) this.#openProviderReview(now);
      else this.#openAttentionRoster();
      return;
    }
    if (index === 11 || index === 13) {
      this.#rosterPage = this.#movePage(
        this.#rosterPage,
        index === 11 ? -1 : 1,
        this.#rosterPages(),
      );
      this.#advanceFrame();
      return;
    }
    if (index === 12) this.#openRosterChoice();
  }

  async #activateSession(
    index: number,
    selected: SessionSnapshot,
    now: number,
  ): Promise<void> {
    if (index === 0) return;
    if (index === 1) {
      if (selected.pendingRequests.length > 0) this.#openProviderReview(now);
      else if (selected.resultLatch) this.#openResultReview(selected);
      else await this.#activateKind(selected, "Inspect", now);
      return;
    }
    if (index === 2) {
      await this.#activateKind(selected, "ResumeSession", now);
      return;
    }
    if (index === 3) {
      if (selected.pendingRequests.length > 0) this.#openProviderReview(now);
      else await this.#activateKind(selected, "ReviewChanges", now);
      return;
    }
    if (index === 4) {
      this.#openReasoningChoice(selected);
      return;
    }
    if (index === 6) {
      await this.#activateKind(selected, "CompactThread", now);
      return;
    }
    if (index === 7) {
      await this.#activateKind(selected, "RetryWork", now);
      return;
    }
    if (index === 8) {
      await this.#activateKind(selected, "CancelRun", now);
      return;
    }
    if (index === 9) {
      if (selected.pendingRequests.length > 0) this.#openProviderReview(now);
      else this.#openAttentionRoster();
      return;
    }
    if (index === 11 || index === 13) {
      const sessions = this.#snapshot.sessions;
      const current = sessions.findIndex(({ id }) => id === selected.id);
      const next = moveClassic15Choice(
        current,
        index === 11 ? -1 : 1,
        sessions.length,
      );
      if (sessions[next])
        await this.#application.selectSession(sessions[next].id);
    }
  }

  async #activateChoice(index: number): Promise<void> {
    const choice = this.#choice;
    if (!choice) return;
    if (index >= 2 && index <= 7 && choice.options[index - 2]) {
      this.#choicePreview = index - 2;
      this.#advanceFrame();
      return;
    }
    if (index === 11 || index === 13) {
      this.#choicePreview = moveClassic15Choice(
        this.#choicePreview,
        index === 11 ? -1 : 1,
        choice.options.length,
      );
      this.#advanceFrame();
      return;
    }
    if (index !== 8) return;
    const option = choice.options[this.#choicePreview];
    if (!option) return;
    if (choice.kind === "roster") {
      if (!ROSTER_MODES.includes(option as RosterMode)) return;
      this.#rosterMode = option as RosterMode;
      this.#attentionRoster = false;
      this.#rosterPage = 0;
      this.#choice = undefined;
      this.#view = "home";
      this.#advanceFrame();
      return;
    }
    if (choice.offer.offerToken) {
      await this.#invoke(choice.offer.offerToken, option);
      this.#choice = undefined;
      this.#view = "session";
      this.#advanceFrame();
    }
  }

  async #activateRequest(index: number, now: number): Promise<void> {
    const review = this.#review;
    if (!review) return;
    const inspect = review.offers.Inspect;
    if (
      index === 9 &&
      inspect?.state === "available" &&
      inspect.offerToken &&
      this.#seenDetailPages.size === review.pages.length
    ) {
      await this.#invoke(inspect.offerToken);
      this.#review = undefined;
      this.#view = "home";
      this.#advanceFrame();
      return;
    }
    if (index === 11 || index === 13) {
      const next = this.#movePage(
        this.#detailPage,
        index === 11 ? -1 : 1,
        review.pages.length,
      );
      if (next === this.#detailPage) return;
      this.#invalidateConfirmation();
      this.#detailPage = next;
      this.#seenDetailPages.add(next);
      this.#advanceFrame();
      this.#armAutomaticDecision(now);
    }
  }

  async #activateKind(
    selected: SessionSnapshot,
    kind: ActionKind,
    now: number,
  ): Promise<void> {
    const offer = selected.actionOffers.find(
      (candidate) => candidate.kind === kind,
    );
    if (!offer || offer.state !== "available" || !offer.offerToken) return;
    if (
      offer.safety.confirmation === "reviewPress" ||
      offer.safety.confirmation === "reviewHold"
    ) {
      const detail =
        kind === "CancelRun"
          ? "Interrupt active Codex work. The current turn will stop. No other thread is changed."
          : "Start a new attempt. Prior effects are not replayed. Review the failed result in Codex.";
      const pagination = paginateClassic15Detail(detail);
      if (!pagination.available) return;
      this.#review = {
        pages: pagination.pages,
        inspection: offer.safety.inspection,
        offers: { [kind]: offer },
        localAction: true,
      };
      this.#detailPage = 0;
      this.#seenDetailPages = new Set([0]);
      this.#view = "request";
      this.#advanceFrame();
      this.#arm(kind, offer, offer.safety.inspection, now);
      return;
    }
    await this.#invoke(offer.offerToken);
  }

  #openProviderReview(now: number): void {
    const selected = this.#selectedSession();
    const detail = this.#application.reviewDetail;
    if (!selected || !detail) return;
    const pagination = paginateClassic15Detail(detail.text);
    if (!pagination.available) return;
    this.#review = {
      pages: pagination.pages,
      inspection: detail.inspection,
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

  #openResultReview(selected: SessionSnapshot): void {
    const result = selected.resultLatch;
    const inspect = selected.actionOffers.find(
      ({ kind, state }) => kind === "Inspect" && state === "available",
    );
    if (!result || !inspect?.offerToken) return;
    const pagination = paginateClassic15Detail(
      `${result.outcome === "completed" ? "Completed" : "Failed"} result for ${selected.name}. Run ${result.runId}. Review this exact result before acknowledging it.`,
    );
    if (!pagination.available) return;
    this.#review = {
      pages: pagination.pages,
      inspection: "target",
      offers: { Inspect: inspect },
      localAction: true,
    };
    this.#detailPage = 0;
    this.#seenDetailPages = new Set([0]);
    this.#view = "request";
    this.#advanceFrame();
  }

  #openAttentionRoster(): void {
    if (this.#attentionSessions().length === 0) return;
    this.#attentionRoster = true;
    this.#rosterPage = 0;
    this.#view = "home";
    this.#review = undefined;
    this.#choice = undefined;
    this.#invalidateConfirmation();
    this.#advanceFrame();
  }

  #openRosterChoice(): void {
    this.#choice = { kind: "roster", options: ROSTER_MODES };
    this.#choicePreview = ROSTER_MODES.indexOf(this.#rosterMode);
    this.#view = "choice";
    this.#advanceFrame();
  }

  #openReasoningChoice(selected: SessionSnapshot): void {
    const offer = selected.actionOffers.find(
      ({ kind, state }) =>
        kind === "ChangeNextTurnOptions" && state === "available",
    );
    if (!offer) return;
    const options = offer.optionIds ?? [];
    this.#choice = { kind: "reasoning", offer, options };
    const current = options.indexOf(selected.nextTurnSettings.reasoningEffort);
    this.#choicePreview = current >= 0 ? current : 0;
    this.#view = "choice";
    this.#advanceFrame();
  }

  #armAutomaticDecision(now: number): void {
    const review = this.#review;
    if (!review) return;
    const only = Object.values(review.offers).filter(
      (offer): offer is ActionOffer => offer !== undefined,
    );
    if (review.localAction && only[0]) {
      this.#arm(only[0].kind, only[0], only[0].safety.inspection, now);
      return;
    }
    if (this.#seenDetailPages.size === review.pages.length) {
      const approve = review.offers.ApproveRequest;
      if (approve?.state === "available") {
        this.#arm("ApproveRequest", approve, review.inspection, now);
      }
    }
  }

  async #decisionDown(index: number, now: number): Promise<void> {
    const kind = this.#decisionKind(index);
    const offer = kind && this.#review?.offers[kind];
    if (!kind || !offer?.offerToken || offer.state !== "available") return;
    if (
      this.#confirmationKind !== kind ||
      this.#confirmation.phase !== "armed"
    ) {
      this.#invalidateConfirmation();
      this.#advanceFrame();
      const inspection =
        this.#seenDetailPages.size === this.#review?.pages.length
          ? this.#review.inspection
          : "target";
      this.#arm(kind, offer, inspection, now, false);
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
    inspection: InspectionLevel,
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
    this.#confirmationKind =
      this.#confirmation.phase === "armed" ? kind : undefined;
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
      invocationId: `classic15:${this.#invocationSequence}`,
      offerToken,
      ...(optionId ? { optionId } : {}),
    });
  }

  #decisionKind(index: number): ActionKind | undefined {
    if (index === 9)
      return this.#review?.offers.RetryWork
        ? "RetryWork"
        : this.#review?.offers.Inspect
          ? "Inspect"
          : "ApproveRequest";
    if (index === 5)
      return this.#review?.offers.CancelRun ? "CancelRun" : "CancelRequest";
    return index === 7 ? "RejectRequest" : undefined;
  }

  #selectedSession(): SessionSnapshot | undefined {
    return this.#snapshot.sessions.find(
      ({ id }) => id === this.#snapshot.selectedSessionId,
    );
  }

  #attentionSessions(): readonly SessionSnapshot[] {
    return this.#snapshot.sessions.filter(
      ({ attention }) => attention.length > 0,
    );
  }

  #rosterSessions(): readonly SessionSnapshot[] {
    if (this.#attentionRoster) return this.#attentionSessions();
    if (this.#rosterMode === "Favorites" || this.#rosterMode === "Custom")
      return [];
    if (this.#rosterMode === "Recent") return this.#snapshot.sessions;
    return [...this.#snapshot.sessions].sort(
      (left, right) => priority(right) - priority(left),
    );
  }

  #rosterPageItems(): readonly SessionSnapshot[] {
    const selectedId = this.#snapshot.selectedSessionId;
    return this.#rosterSessions()
      .filter(({ id }) => id !== selectedId)
      .slice(
        this.#rosterPage * ROSTER_PAGE_SIZE,
        this.#rosterPage * ROSTER_PAGE_SIZE + ROSTER_PAGE_SIZE,
      );
  }

  #rosterPages(): number {
    const selectedId = this.#snapshot.selectedSessionId;
    const candidateCount = this.#rosterSessions().filter(
      ({ id }) => id !== selectedId,
    ).length;
    return Math.max(1, Math.ceil(candidateCount / ROSTER_PAGE_SIZE));
  }

  #boundPages(): void {
    this.#rosterPage = this.#movePage(this.#rosterPage, 0, this.#rosterPages());
    if (this.#review) {
      this.#detailPage = this.#movePage(
        this.#detailPage,
        0,
        this.#review.pages.length,
      );
    }
  }

  #movePage(current: number, direction: -1 | 0 | 1, total: number): number {
    return Math.min(Math.max(current + direction, 0), Math.max(total - 1, 0));
  }

  #invalidateConfirmation(): void {
    this.#confirmation = reduceConfirmation(this.#confirmation, {
      type: "invalidate",
    }).state;
    this.#confirmationKind = undefined;
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

  #keyViews(
    view: Classic15MvpFrame["view"],
    selected: SessionSnapshot | undefined,
  ): Classic15KeyView[] {
    const state = selected?.primaryState ?? "unavailable";
    if (view === "unavailable" || !selected) {
      const reason = this.#snapshot.integration.reason ?? "Starting";
      return views(
        [
          "Offline",
          reason,
          "Open Codex",
          "Check auth",
          "Retry entry",
          "",
          "",
          "",
          "",
          "",
          "Home",
          "",
          "Unavailable",
          "",
          "Exit",
        ],
        state,
        [10, 14],
      );
    }
    if (view === "home") {
      const items = this.#rosterPageItems();
      const pageCount = this.#rosterPages();
      const attentionCount = this.#attentionSessions().length;
      const labels = [
        compactLabel(selected.name, 24),
        ...Array.from({ length: ROSTER_PAGE_SIZE }, (_, index) =>
          items[index] ? compactLabel(items[index].name, 24) : "",
        ),
        "",
        "",
        "",
        "",
        attentionCount > 0 ? `${attentionCount} attention` : "",
        "",
        this.#rosterPage > 0 ? "Previous" : "",
        pageCount > 1
          ? `${this.#attentionRoster ? "Attention" : this.#rosterMode} ${this.#rosterPage + 1}/${pageCount}`
          : this.#attentionRoster
            ? "Attention"
            : this.#rosterMode,
        this.#rosterPage + 1 < pageCount ? "Next" : "",
        "Exit",
      ];
      const sessionKeys = [0, ...items.map((_, index) => index + 1)];
      const keys = views(
        labels,
        state,
        [
          ...sessionKeys,
          ...(attentionCount > 0 ? [9] : []),
          ...(this.#rosterPage > 0 ? [11] : []),
          12,
          ...(this.#rosterPage + 1 < pageCount ? [13] : []),
          14,
        ],
        undefined,
        sessionKeys,
      );
      items.forEach((item, index) => {
        const key = keys[index + 1];
        if (key) keys[index + 1] = { ...key, state: item.primaryState };
      });
      const selectedKey = keys[0];
      if (selectedKey) keys[0] = { ...selectedKey, icon: "session" };
      return keys;
    }
    if (view === "session") {
      const position = this.#snapshot.sessions.findIndex(
        ({ id }) => id === selected.id,
      );
      const inspectAvailable = offerAvailable(selected, "Inspect");
      const pendingRequest = selected.pendingRequests.length > 0;
      const attentionElsewhere = this.#attentionSessions().some(
        ({ id }) => id !== selected.id,
      );
      const labels = [
        compactLabel(selected.name, 24),
        pendingRequest
          ? "Inspect request"
          : inspectAvailable
            ? selected.resultLatch
              ? "Inspect result"
              : "Inspect"
            : "",
        offerAvailable(selected, "ResumeSession") ? "Resume" : "",
        pendingRequest
          ? "Review request"
          : offerAvailable(selected, "ReviewChanges")
            ? "Review changes"
            : "",
        offerAvailable(selected, "ChangeNextTurnOptions") ? "Reasoning" : "",
        "",
        offerAvailable(selected, "CompactThread") ? "Compact" : "",
        offerAvailable(selected, "RetryWork") ? "Retry" : "",
        offerAvailable(selected, "CancelRun") ? "Cancel run" : "",
        !pendingRequest && attentionElsewhere ? "Other attention" : "",
        "Back",
        position > 0 ? "Previous" : "",
        this.#snapshot.sessions.length > 1
          ? `Thread ${position + 1}/${this.#snapshot.sessions.length}`
          : "",
        position + 1 < this.#snapshot.sessions.length ? "Next" : "",
        "Exit",
      ];
      const enabled = [0, 10, 14];
      for (const [index, kind] of [
        [1, selected.pendingRequests.length > 0 ? undefined : "Inspect"],
        [2, "ResumeSession"],
        [3, pendingRequest ? undefined : "ReviewChanges"],
        [4, "ChangeNextTurnOptions"],
        [6, "CompactThread"],
        [7, "RetryWork"],
        [8, "CancelRun"],
      ] as const) {
        if (!kind || offerAvailable(selected, kind)) enabled.push(index);
      }
      if (pendingRequest) enabled.push(1, 3);
      if (attentionElsewhere) enabled.push(9);
      if (position > 0) enabled.push(11);
      if (this.#snapshot.sessions.length > 1) enabled.push(12);
      if (position + 1 < this.#snapshot.sessions.length) enabled.push(13);
      return withSessionIdentity(views(labels, state, enabled));
    }
    if (view === "choice" && this.#choice) {
      const labels = [
        compactLabel(selected.name, 24),
        this.#choice.kind === "roster" ? "Roster mode" : "Reasoning",
        ...Array.from(
          { length: 6 },
          (_, index) => this.#choice?.options[index] ?? "",
        ),
        "Apply",
        "",
        "Back",
        this.#choicePreview > 0 ? "Lower" : "",
        this.#choice.options[this.#choicePreview] ?? "No choice",
        this.#choicePreview + 1 < this.#choice.options.length ? "Higher" : "",
        "Exit",
      ];
      return withSessionIdentity(
        views(labels, state, [
          0,
          1,
          ...this.#choice.options.map((_, index) => index + 2),
          ...(this.#choice.options.length > 0 ? [8] : []),
          10,
          ...(this.#choicePreview > 0 ? [11] : []),
          12,
          ...(this.#choicePreview + 1 < this.#choice.options.length
            ? [13]
            : []),
          14,
        ]),
      );
    }
    const page = this.#review?.pages[this.#detailPage];
    const labels = Array(15).fill("") as string[];
    labels[0] = compactLabel(selected.name, 24);
    DETAIL_KEYS.forEach((key, index) => {
      labels[key] = page?.cells[index]?.lines.join(" ") ?? "";
    });
    labels[5] = this.#decisionLabel("CancelRequest");
    labels[7] = this.#decisionLabel("RejectRequest");
    labels[9] = this.#review?.offers.Inspect
      ? "Acknowledge"
      : this.#decisionLabel("ApproveRequest");
    labels[10] = "Back";
    labels[11] = "Previous";
    labels[12] = `Page ${this.#detailPage + 1}/${this.#review?.pages.length ?? 1}`;
    labels[13] = "Next";
    labels[14] = "Exit";
    const enabled = [0, 10, 12, 14];
    if (this.#detailPage > 0) enabled.push(11);
    if (this.#detailPage + 1 < (this.#review?.pages.length ?? 1))
      enabled.push(13);
    for (const [index, kind] of [
      [5, this.#review?.offers.CancelRun ? "CancelRun" : "CancelRequest"],
      [7, "RejectRequest"],
      [
        9,
        this.#review?.offers.RetryWork
          ? "RetryWork"
          : this.#review?.offers.Inspect
            ? "Inspect"
            : "ApproveRequest",
      ],
    ] as const) {
      if (
        kind &&
        this.#review?.offers[kind]?.state === "available" &&
        (kind !== "Inspect" ||
          this.#seenDetailPages.size === (this.#review?.pages.length ?? 0))
      )
        enabled.push(index);
    }
    return withSessionIdentity(views(labels, state, enabled, page));
  }

  #decisionLabel(
    kind: "ApproveRequest" | "CancelRequest" | "RejectRequest",
  ): string {
    const actual =
      kind === "ApproveRequest" && this.#review?.offers.RetryWork
        ? "RetryWork"
        : kind === "CancelRequest" && this.#review?.offers.CancelRun
          ? "CancelRun"
          : kind;
    const offer = this.#review?.offers[actual];
    if (!offer || offer.state !== "available") return "Unavailable";
    const label = actionLabel(actual);
    if (this.#confirmationKind !== actual) return label;
    return offer.safety.confirmation === "reviewHold"
      ? `Hold ${label.toLowerCase()}`
      : `Confirm ${label.toLowerCase()}`;
  }
}

function views(
  labels: readonly string[],
  state: PrimaryState,
  enabled: readonly number[],
  page?: Classic15DetailPage,
  stateKeys: readonly number[] = [0],
): Classic15KeyView[] {
  return labels.map((label, index) => {
    const detailIndex = DETAIL_KEYS.indexOf(
      index as (typeof DETAIL_KEYS)[number],
    );
    const lines =
      detailIndex >= 0 ? page?.cells[detailIndex]?.lines : undefined;
    return {
      index,
      label,
      ...(lines ? { lines } : {}),
      enabled: enabled.includes(index),
      state,
      icon: stateKeys.includes(index) ? "state" : actionIcon(label),
    };
  });
}

function withSessionIdentity(keys: Classic15KeyView[]): Classic15KeyView[] {
  const selected = keys[0];
  if (selected) keys[0] = { ...selected, icon: "session" };
  return keys;
}

function offerAvailable(selected: SessionSnapshot, kind: ActionKind): boolean {
  return selected.actionOffers.some(
    (offer) => offer.kind === kind && offer.state === "available",
  );
}

function priority(session: SessionSnapshot): number {
  if (session.pendingRequests.length > 0) return 6;
  if (session.primaryState === "failed") return 5;
  if (session.primaryState === "completed") return 4;
  if (session.primaryState === "working") return 3;
  if (session.primaryState === "waiting") return 2;
  return 1;
}

function actionLabel(kind: ActionKind): string {
  const labels: Record<ActionKind, string> = {
    ResumeSession: "Resume",
    Inspect: "Inspect",
    ReviewChanges: "Review changes",
    CompactThread: "Compact",
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
