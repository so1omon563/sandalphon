/* global WebSocket, document, window */

let socket;
let propertyInspectorUUID;
let actionUUID;

const enabled = document.querySelector("#enabled");
const status = document.querySelector("#status");
const retry = document.querySelector("#retry");

window.connectElgatoStreamDeckSocket = (
  port,
  uuid,
  registerEvent,
  _info,
  actionInfo,
) => {
  propertyInspectorUUID = uuid;
  const action = JSON.parse(actionInfo);
  actionUUID = action.action;
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({ event: registerEvent, uuid: propertyInspectorUUID }),
    );
  });
  socket.addEventListener("message", ({ data }) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (message.event !== "sendToPropertyInspector") return;
    render(message.payload);
  });
};

enabled.addEventListener("change", () => {
  send({ type: "desktopControl.setEnabled", enabled: enabled.checked });
});
retry.addEventListener("click", () => {
  send({ type: "desktopControl.retry" });
});

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      action: actionUUID,
      event: "sendToPlugin",
      context: propertyInspectorUUID,
      payload,
    }),
  );
}

function render(payload) {
  if (!payload || payload.type !== "desktopControl.status") return;
  enabled.checked = payload.enabled === true;
  const value = payload.status ?? { phase: "disabled" };
  const labels = {
    disabled: "Disabled. Codex runs normally without a debugging listener.",
    starting: "Starting exact-version desktop control…",
    stopping: "Removing the listener and restarting Codex normally…",
    ready: `Ready. ${value.taskCount ?? 0} desktop tasks available.`,
  };
  const reasons = {
    restartRequired: "Quit Codex, then retry to start controlled mode.",
    unsupportedVersion: "This Codex desktop version is not supported.",
    launchFailed: "Codex could not be started in controlled mode.",
    endpointUnavailable:
      "Codex opened, but its debugging endpoint did not become reachable.",
    endpointRejected:
      "Codex opened, but its debugging endpoint did not match the accepted contract.",
    versionRejected:
      "Codex opened, but its debugging version tuple did not match the accepted contract.",
    targetSetRejected:
      "Codex opened, but its debugging target set did not match the accepted contract.",
    targetRejected:
      "Codex opened, but its application page did not match the accepted contract.",
    targetTypeRejected:
      "Codex opened, but its application target was not a page.",
    targetOriginRejected:
      "Codex opened, but its application page was not at the accepted app origin.",
    debuggerUrlRejected:
      "Codex opened, but its page debugger URL was not the expected loopback endpoint.",
    listenerRejected:
      "Codex opened, but listener ownership could not be verified.",
    processRejected:
      "Codex opened, but the controlled process arguments could not be verified.",
    rendererTimeout:
      "Codex opened, but its renderer did not answer the bounded readiness probe.",
    capabilityUnavailable:
      "Codex opened, but the exact task controls never became available.",
    taskSetRejected:
      "Codex returned a task list outside Sandalphon's bounded size.",
    taskEntryRejected: "Codex returned a malformed or duplicate task entry.",
    taskSelectionRejected: "Codex did not identify exactly one selected task.",
    connectionFailed: "The exact desktop capability check failed closed.",
    cleanupFailed: "Restart Codex normally to remove the debugging listener.",
  };
  status.textContent =
    value.phase === "unavailable"
      ? (reasons[value.reason] ?? "Desktop control is unavailable.")
      : (labels[value.phase] ?? "Desktop control is unavailable.");
  retry.hidden =
    !payload.enabled ||
    value.phase !== "unavailable" ||
    value.reason === "unsupportedVersion";
}
