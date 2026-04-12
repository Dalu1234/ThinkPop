"""
ThinkPop motion server — local stand-in for an MDM /generate endpoint.

Runs on http://127.0.0.1:8000 by default. Vite proxies /api/motion → /generate.

Returns HumanML3D-style frames: 22 joints × [x, y, z] per frame (see src/lib/retarget.js).

This is procedural motion (no ML) so development works without a separate MDM repo/GPU.
"""

from __future__ import annotations

import math
from copy import deepcopy
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# HumanML3D joint order — must match HML_JOINT_NAMES in src/lib/retarget.js
#
# Left side = positive X, right side = negative X.
# Arms must stay OUTWARD from the body midline so the retargeter
# never inverts the parent→child direction (which clips arms into the torso).
_REST_POSE: list[list[float]] = [
    [ 0.00, 0.94, 0.00],  #  0 pelvis
    [ 0.09, 0.86, 0.02],  #  1 left_hip
    [-0.09, 0.86, 0.02],  #  2 right_hip
    [ 0.00, 1.05, 0.02],  #  3 spine1
    [ 0.09, 0.50, 0.04],  #  4 left_knee
    [-0.09, 0.50, 0.04],  #  5 right_knee
    [ 0.00, 1.20, 0.02],  #  6 spine2
    [ 0.09, 0.10, 0.06],  #  7 left_ankle
    [-0.09, 0.10, 0.06],  #  8 right_ankle
    [ 0.00, 1.40, 0.02],  #  9 spine3
    [ 0.11, 0.02, 0.08],  # 10 left_foot
    [-0.11, 0.02, 0.08],  # 11 right_foot
    [ 0.00, 1.55, 0.02],  # 12 neck
    [ 0.10, 1.48, 0.04],  # 13 left_collar
    [-0.10, 1.48, 0.04],  # 14 right_collar
    [ 0.00, 1.72, 0.02],  # 15 head
    [ 0.28, 1.42, 0.04],  # 16 left_shoulder
    [-0.28, 1.42, 0.04],  # 17 right_shoulder
    [ 0.46, 1.18, 0.06],  # 18 left_elbow
    [-0.46, 1.18, 0.06],  # 19 right_elbow
    [ 0.56, 0.95, 0.08],  # 20 left_wrist
    [-0.56, 0.95, 0.08],  # 21 right_wrist
]

FPS = 20


class GenerateBody(BaseModel):
    prompt: str = ""
    num_frames: int = Field(default=80, ge=8, le=300)


app = FastAPI(title="ThinkPop motion (dev)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _style(prompt: str) -> str:
    p = prompt.lower()
    if "jump" in p or "leap" in p or "hop" in p:
        return "jump"
    if "wave" in p:
        return "wave"
    if "point" in p:
        return "point"
    if "count" in p:
        return "count"
    if "open" in p or "wide" in p:
        return "open"
    if "rest" in p or "neutral" in p or "relaxed" in p:
        return "rest"
    if "emphas" in p or "gestur" in p or "explain" in p:
        return "emphasize"
    return "emphasize"


def _frame(t: float, style: str) -> list[list[float]]:
    """One pose at normalised time t in [0, 1].

    All arm offsets push joints AWAY from midline (left = +X, right = -X)
    so the retargeter never flips a bone direction inward.
    """
    pose = deepcopy(_REST_POSE)
    phase = t * math.pi * 2
    breathe = 0.012 * math.sin(phase * 2)
    pose[0][1] += breathe
    pose[3][1] += breathe * 0.6

    if style == "wave":
        wave = math.sin(phase * 3)
        # Shoulder: out and ABOVE collar — upper arm raised
        pose[17][0] = -0.34
        pose[17][1] = 1.58
        pose[17][2] = 0.02
        # Elbow: above shoulder — forearm vertical
        pose[19][0] = -0.38
        pose[19][1] = 1.82
        pose[19][2] = 0.0
        # Wrist: highest, waves side-to-side
        pose[21][0] = -0.32 + 0.12 * wave
        pose[21][1] = 2.02 + 0.06 * wave
        pose[21][2] = -0.02 + 0.06 * math.sin(phase * 3 - 0.4)

    elif style == "point":
        bob = math.sin(phase) * 0.04
        pose[17][0] -= 0.04
        pose[17][1] += 0.10
        pose[19][0] -= 0.10
        pose[19][1] += 0.15 + bob
        pose[19][2] -= 0.18
        pose[21][0] -= 0.06
        pose[21][1] += 0.12 + bob
        pose[21][2] -= 0.45

    elif style == "count":
        tap = math.sin(phase * 4)
        pose[17][0] -= 0.04
        pose[17][1] += 0.10
        pose[19][0] -= 0.08
        pose[19][1] += 0.20 + 0.06 * tap
        pose[19][2] -= 0.12
        pose[21][0] -= 0.04
        pose[21][1] += 0.18 + 0.10 * tap
        pose[21][2] -= 0.20

    elif style == "open":
        sway = math.sin(phase) * 0.06
        pose[16][0] += 0.15 + sway
        pose[16][1] += 0.10
        pose[18][0] += 0.22 + sway
        pose[18][1] += 0.12
        pose[20][0] += 0.28 + sway
        pose[20][1] += 0.08 + sway * 0.5
        pose[17][0] -= 0.15 + sway
        pose[17][1] += 0.10
        pose[19][0] -= 0.22 + sway
        pose[19][1] += 0.12
        pose[21][0] -= 0.28 + sway
        pose[21][1] += 0.08 + sway * 0.5

    elif style == "jump":
        jc = (t * 2) % 1
        if jc < 0.20:
            c = jc / 0.20
            dip = 0.10 * math.sin(c * math.pi)
            pose[0][1] -= dip
            pose[4][2] += dip * 2.0
            pose[5][2] += dip * 2.0
        elif jc < 0.50:
            a = (jc - 0.20) / 0.30
            lift = 0.20 * math.sin(a * math.pi)
            for j in range(len(pose)):
                pose[j][1] += lift
            arm = math.sin(a * math.pi) * 0.12
            pose[16][1] += arm
            pose[17][1] += arm
            pose[18][1] += arm * 0.7
            pose[19][1] += arm * 0.7
        elif jc < 0.66:
            l_ = (jc - 0.50) / 0.16
            impact = 0.08 * math.sin(l_ * math.pi)
            pose[0][1] -= impact
            pose[4][2] += impact * 1.8
            pose[5][2] += impact * 1.8

    elif style == "rest":
        pass

    else:  # emphasize
        s = math.sin(phase * 2)
        pose[16][0] += 0.08 * abs(s)
        pose[16][1] += 0.06 * s
        pose[18][0] += 0.10 * abs(s)
        pose[18][1] += 0.10 * s
        pose[20][0] += 0.12 * abs(s)
        pose[20][1] += 0.14 * s
        pose[17][0] -= 0.08 * abs(s)
        pose[17][1] += 0.06 * s
        pose[19][0] -= 0.10 * abs(s)
        pose[19][1] += 0.10 * s
        pose[21][0] -= 0.12 * abs(s)
        pose[21][1] += 0.14 * s

    return pose


def generate_frames(prompt: str, num_frames: int) -> dict[str, Any]:
    style = _style(prompt)
    frames: list[list[list[float]]] = []
    for i in range(num_frames):
        t = i / max(num_frames - 1, 1)
        frames.append(_frame(t, style))
    return {
        "frames": frames,
        "fps": FPS,
        "mode": f"procedural-{style}",
    }


@app.post("/generate")
def generate(body: GenerateBody) -> dict[str, Any]:
    return generate_frames(body.prompt, body.num_frames)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
