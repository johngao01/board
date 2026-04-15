const GATE_STORAGE_KEY = 'board-gate-unlocked'
const GATE_SESSION_TTL_MS = 1000 * 60 * 60 * 24

interface GateSessionPayload {
    unlocked: boolean
    expiresAt: number
}

function readGateSession() {
    const raw = localStorage.getItem(GATE_STORAGE_KEY)
    if (!raw) {
        return null
    }

    try {
        const payload = JSON.parse(raw) as GateSessionPayload
        if (!payload.unlocked || typeof payload.expiresAt !== 'number') {
            localStorage.removeItem(GATE_STORAGE_KEY)
            return null
        }

        if (payload.expiresAt <= Date.now()) {
            localStorage.removeItem(GATE_STORAGE_KEY)
            return null
        }

        return payload
    } catch {
        localStorage.removeItem(GATE_STORAGE_KEY)
        return null
    }
}

export function isGateUnlocked() {
    return readGateSession() !== null
}

export function unlockGate() {
    const payload: GateSessionPayload = {
        unlocked: true,
        expiresAt: Date.now() + GATE_SESSION_TTL_MS,
    }
    localStorage.setItem(GATE_STORAGE_KEY, JSON.stringify(payload))
}

export function lockGate() {
    localStorage.removeItem(GATE_STORAGE_KEY)
}
