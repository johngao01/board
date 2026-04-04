const GATE_STORAGE_KEY = 'board-gate-unlocked'

export function isGateUnlocked() {
  return sessionStorage.getItem(GATE_STORAGE_KEY) === '1'
}

export function unlockGate() {
  sessionStorage.setItem(GATE_STORAGE_KEY, '1')
}
