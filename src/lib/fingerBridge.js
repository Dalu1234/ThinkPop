/**
 * Module-level bridge for finger-tip position between the MediaPipe hand tracker
 * (DOM overlay) and the Three.js scene (R3F Canvas). Both sides import this
 * module and read/write the same object — no React state, no re-renders.
 */

export const fingerState = { x: -1, y: -1, active: false }

export function updateFingerTip(x, y) {
  fingerState.x = x
  fingerState.y = y
  fingerState.active = true
}

export function clearFingerTip() {
  fingerState.x = -1
  fingerState.y = -1
  fingerState.active = false
}
