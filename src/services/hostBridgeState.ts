/**
 * Tiny shared flags so AppContext heartbeats and LiveStudio stay in sync
 * without circular React context imports.
 */

export type BridgeWorkspaceMode = 'waiting_1v1' | 'solo_calling';

let isLive = false;
let workspaceMode: BridgeWorkspaceMode = 'waiting_1v1';

export function setBridgeLive(value: boolean) {
  isLive = Boolean(value);
}

export function getBridgeLive() {
  return isLive;
}

export function setBridgeWorkspaceMode(mode: BridgeWorkspaceMode) {
  workspaceMode = mode;
}

export function getBridgeWorkspaceMode() {
  return workspaceMode;
}
