export type KeyIcon =
  | "state"
  | "resume"
  | "inspect"
  | "details"
  | "exit"
  | "attention"
  | "review"
  | "reasoning"
  | "retry"
  | "cancel"
  | "back"
  | "home"
  | "previous"
  | "next"
  | "roster"
  | "actions"
  | "apply"
  | "approve"
  | "reject"
  | "offline";

export function actionIcon(label: string): KeyIcon {
  const value = label.toLowerCase();
  if (value.includes("resume") || value.includes("start")) return "resume";
  if (value.includes("inspect")) return "inspect";
  if (value.includes("exit")) return "exit";
  if (value.includes("attention")) return "attention";
  if (value.includes("review") || value === "request") return "review";
  if (value.includes("reasoning")) return "reasoning";
  if (value.includes("retry")) return "retry";
  if (value.includes("cancel") || value.includes("interrupt")) return "cancel";
  if (value.includes("reject")) return "reject";
  if (value.includes("approve") || value.includes("acknowledge"))
    return "approve";
  if (value === "back") return "back";
  if (value === "home") return "home";
  if (value.includes("previous") || value === "lower") return "previous";
  if (value === "next" || value === "higher") return "next";
  if (value === "apply") return "apply";
  if (value.includes("action")) return "actions";
  if (
    value.includes("priority") ||
    value.includes("recent") ||
    value.includes("favorite") ||
    value.includes("custom") ||
    value.startsWith("thread ")
  )
    return "roster";
  if (value.includes("offline") || value.includes("unavailable"))
    return "offline";
  return "details";
}
