export interface ProbeArguments {
  readonly port: number;
  readonly switchAndRestore: boolean;
}

export interface DesktopProbeTask {
  readonly id: string;
  readonly selected: boolean;
  readonly visible: boolean;
}

export const PROVEN_DESKTOP_VERSION: Readonly<{
  application: string;
  engine: string;
  protocol: string;
}>;

export function parseProbeArguments(argv: readonly string[]): ProbeArguments;
export function decodeDiscovery(value: unknown, port: number): string;
export function decodeDesktopTasks(value: unknown): DesktopProbeTask[];
export function summarizeDesktopTasks(tasks: readonly DesktopProbeTask[]): {
  readonly capabilities: readonly ["task.list", "task.select"];
  readonly taskCount: number;
  readonly selectedCount: number;
  readonly visibleAlternativeCount: number;
};
export function taskListExpression(): string;
export function switchAndRestoreExpression(
  originalId: string,
  candidateId: string,
): string;
