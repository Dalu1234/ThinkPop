/**
 * gamepad.js — Web Gamepad API polling for Xbox controller.
 *
 * Standard Xbox mapping (Chromium):
 *   axes[0] = left  stick X   (left=−1, right=+1)
 *   axes[1] = left  stick Y   (up=−1,   down=+1)  ← Y is INVERTED
 *   axes[2] = right stick X   (left=−1, right=+1)
 *   axes[3] = right stick Y   (up=−1,   down=+1)  ← Y is INVERTED
 *
 *   buttons[0]  = A        buttons[1]  = B
 *   buttons[2]  = X        buttons[3]  = Y
 *   buttons[4]  = LB       buttons[5]  = RB
 *   buttons[6]  = LT (0-1) buttons[7]  = RT (0-1)
 *   buttons[8]  = Back     buttons[9]  = Start
 *   buttons[10] = L3       buttons[11] = R3
 *   buttons[12] = D-Up     buttons[13] = D-Down
 *   buttons[14] = D-Left   buttons[15] = D-Right
 */

const DEFAULT_DEADZONE = 0.12

function applyDeadzone(v, dz) {
  if (Math.abs(v) < dz) return 0
  return (v - Math.sign(v) * dz) / (1 - dz)
}

function btn(b) { return b?.pressed ?? false }

/**
 * Read the first connected gamepad.
 * Returns a stable zero-value object when no gamepad is present.
 */
export function readGamepad(deadzone = DEFAULT_DEADZONE) {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    return _DISCONNECTED
  }
  const pads = navigator.getGamepads()
  for (let i = 0; i < pads.length; i++) {
    const gp = pads[i]
    if (!gp || !gp.connected) continue
    return {
      connected: true,
      // Sticks (Y inverted — caller negates ry/ly for world-up)
      lx: applyDeadzone(gp.axes[0] ?? 0, deadzone),
      ly: applyDeadzone(gp.axes[1] ?? 0, deadzone),
      rx: applyDeadzone(gp.axes[2] ?? 0, deadzone),
      ry: applyDeadzone(gp.axes[3] ?? 0, deadzone),
      // Triggers
      lt: gp.buttons[6]?.value ?? 0,
      rt: gp.buttons[7]?.value ?? 0,
      // Face buttons
      a: btn(gp.buttons[0]),
      b: btn(gp.buttons[1]),
      x: btn(gp.buttons[2]),
      y: btn(gp.buttons[3]),
      // Bumpers
      lb: btn(gp.buttons[4]),
      rb: btn(gp.buttons[5]),
      // Stick clicks
      l3: btn(gp.buttons[10]),
      r3: btn(gp.buttons[11]),
      // D-pad
      dUp:    btn(gp.buttons[12]),
      dDown:  btn(gp.buttons[13]),
      dLeft:  btn(gp.buttons[14]),
      dRight: btn(gp.buttons[15]),
    }
  }
  return _DISCONNECTED
}

const _DISCONNECTED = {
  connected: false,
  lx: 0, ly: 0, rx: 0, ry: 0,
  lt: 0, rt: 0,
  a: false, b: false, x: false, y: false,
  lb: false, rb: false, l3: false, r3: false,
  dUp: false, dDown: false, dLeft: false, dRight: false,
}
