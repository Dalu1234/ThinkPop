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
# 0 pelvis … 21 wrists
_REST_POSE: list[list[float]] = [
    [0.0, 0.94, 0.0],
    [0.09, 0.86, 0.02],
    [-0.09, 0.86, 0.02],
    [0.0, 1.05, 0.02],
    [0.09, 0.50, 0.04],
    [-0.09, 0.50, 0.04],
    [0.0, 1.20, 0.02],
    [0.09, 0.10, 0.06],
    [-0.09, 0.10, 0.06],
    [0.0, 1.40, 0.02],
    [0.11, 0.02, 0.08],
    [-0.11, 0.02, 0.08],
    [0.0, 1.55, 0.02],
    [0.06, 1.48, 0.04],
    [-0.06, 1.48, 0.04],
    [0.0, 1.72, 0.02],
    [0.22, 1.42, 0.06],
    [-0.20, 1.42, 0.06],
    [0.38, 1.18, 0.10],
    [-0.36, 1.18, 0.10],
    [0.48, 0.95, 0.12],
    [-0.46, 0.95, 0.12],
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


def _frame(
    t: float,
    n: int,
    style: str,
) -> list[list[float]]:
    """One pose at normalized time t in [0, 1]."""
    pose = deepcopy(_REST_POSE)
    phase = t * math.pi * 2
    amp = 3.2  # match frontend — small joint deltas are nearly invisible after retarget
    breathe = 0.02 * math.sin(phase * 2)

    pose[0][1] += breathe
    pose[3][1] += breathe * 0.8

    # Joint indices: 16 L shoulder, 17 R shoulder, 18 L elbow, 19 R elbow, 20 L wrist, 21 R wrist
    if style == "wave":
        w = 0.22 * amp * math.sin(phase * 3)
        pose[17][0] += 0.05 * amp * math.sin(phase * 3)
        pose[17][1] += 0.06 * amp * abs(math.sin(phase * 3))
        pose[19][0] += w * 0.9
        pose[19][1] += 0.08 * amp * math.sin(phase * 3)
        pose[21][0] += w * 1.15
        pose[21][1] += 0.14 * amp * math.sin(phase * 3)
    elif style == "point":
        k = (0.25 + 0.05 * math.sin(phase)) * amp
        pose[17][2] -= 0.08 * amp
        pose[19][0] += k
        pose[19][1] -= 0.06 * amp
        pose[19][2] -= 0.12 * amp
        pose[21][0] += k * 1.15
        pose[21][1] -= 0.14 * amp
        pose[21][2] -= 0.4 * amp
    elif style == "count":
        tap = 0.12 * amp * math.sin(phase * 5)
        pose[20][1] += tap
        pose[20][2] += tap * 0.5
        pose[18][1] += tap * 0.35
    elif style == "open":
        pose[16][0] += (0.2 + 0.05 * math.sin(phase)) * amp
        pose[17][0] -= (0.2 + 0.05 * math.sin(phase)) * amp
        pose[18][0] += 0.1 * amp
        pose[19][0] -= 0.1 * amp
        pose[20][1] += 0.08 * amp * math.sin(phase)
        pose[21][1] += 0.08 * amp * math.sin(phase)
    elif style == "rest":
        pass
    else:  # emphasize
        pose[16][0] += 0.1 * amp * math.sin(phase * 2)
        pose[17][0] -= 0.1 * amp * math.sin(phase * 2)
        pose[18][1] += 0.08 * amp * math.sin(phase * 2)
        pose[19][1] += 0.08 * amp * math.sin(phase * 2)
        pose[20][0] += 0.07 * amp * math.sin(phase * 2.5)
        pose[21][0] -= 0.07 * amp * math.sin(phase * 2.5)

    return pose


def generate_frames(prompt: str, num_frames: int) -> dict[str, Any]:
    style = _style(prompt)
    frames: list[list[list[float]]] = []
    for i in range(num_frames):
        t = i / max(num_frames - 1, 1)
        frames.append(_frame(t, num_frames, style))
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
