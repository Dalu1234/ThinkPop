"""
ThinkPop motion gateway — forwards text prompts to your MDM (Motion Diffusion) inference service.

- Set MDM_SERVICE_URL to the base URL of a service that exposes POST /generate with JSON
  {"prompt": str, "num_frames": int} and returns {"frames": [...], "fps": number, "mode": str}.
  Frames: list of frames, each frame 22 joints × [x, y, z] (HumanML3D; see src/lib/retarget.js).

- For local dev without a GPU MDM stack, set MOTION_DEV_STUB=1 to use the built-in stub
  (clearly not MDM output — only for wiring tests).

- If neither MDM_SERVICE_URL nor MOTION_DEV_STUB is enabled, /generate returns 503.

Brainpop MDM (same contract): run ``python -m uvicorn main:app --host 127.0.0.1 --port 8001``
from ``brainpop/backend``, then either:

- Set ``VITE_MOTION_PROXY_TARGET=http://127.0.0.1:8001`` in ThinkPop ``.env`` (Vite proxies
  ``/api/motion`` straight to brainpop — no ThinkPop motion-server), or

- Set ``MDM_SERVICE_URL=http://127.0.0.1:8001`` and ``MOTION_DEV_STUB=0`` in
  ``motion-server/.env`` and run ``npm run dev:motion`` on port 8000 (gateway forwards).
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import urllib.error
import urllib.request
from copy import deepcopy
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

_REST_POSE: list[list[float]] = [
    [0.00, 0.94, 0.00],
    [0.09, 0.86, 0.02],
    [-0.09, 0.86, 0.02],
    [0.00, 1.05, 0.02],
    [0.09, 0.50, 0.04],
    [-0.09, 0.50, 0.04],
    [0.00, 1.20, 0.02],
    [0.09, 0.10, 0.06],
    [-0.09, 0.10, 0.06],
    [0.00, 1.40, 0.02],
    [0.11, 0.02, 0.08],
    [-0.11, 0.02, 0.08],
    [0.00, 1.55, 0.02],
    [0.10, 1.48, 0.04],
    [-0.10, 1.48, 0.04],
    [0.00, 1.72, 0.02],
    [0.28, 1.42, 0.04],
    [-0.28, 1.42, 0.04],
    [0.46, 1.18, 0.06],
    [-0.46, 1.18, 0.06],
    [0.56, 0.95, 0.08],
    [-0.56, 0.95, 0.08],
]

FPS = 20


class GenerateBody(BaseModel):
    prompt: str = ""
    num_frames: int = Field(default=80, ge=8, le=300)


app = FastAPI(title="ThinkPop motion gateway")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _dev_stub_enabled() -> bool:
    v = os.environ.get("MOTION_DEV_STUB", "1").strip().lower()
    return v in ("1", "true", "yes", "on")


def _mdm_base_url() -> str:
    return os.environ.get("MDM_SERVICE_URL", "").strip().rstrip("/")


def _validate_mdm_payload(data: dict[str, Any]) -> None:
    frames = data.get("frames")
    if not isinstance(frames, list) or len(frames) < 1:
        raise ValueError("missing frames")
    f0 = frames[0]
    if not isinstance(f0, list) or len(f0) != 22:
        raise ValueError("bad frame shape")
    if not isinstance(f0[0], list) or len(f0[0]) != 3:
        raise ValueError("bad joint shape")


def forward_to_mdm_service(base_url: str, prompt: str, num_frames: int) -> dict[str, Any]:
    url = f"{base_url}/generate"
    payload = json.dumps({"prompt": prompt, "num_frames": num_frames}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        raise HTTPException(status_code=502, detail=f"MDM HTTP {e.code}: {body}") from e
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"MDM unreachable: {e.reason}") from e

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail="MDM returned non-JSON") from e

    try:
        _validate_mdm_payload(data)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"Invalid MDM payload: {e}") from e

    if "fps" not in data:
        data["fps"] = FPS
    data.setdefault("mode", "mdm-service")
    return data


def _style_dev_stub(prompt: str) -> str:
    """Keyword routing exists ONLY for MOTION_DEV_STUB — not used in production MDM path."""
    p = prompt.lower()
    if "jump" in p or "leap" in p or "hop" in p:
        return "jump"
    if "wave" in p:
        return "wave"
    if "point" in p:
        return "point"
    if "count" in p:
        return "count"
    if "walk" in p or "step" in p or "stride" in p:
        return "walk"
    if "rest" in p or "neutral" in p or "relaxed" in p:
        return "rest"
    return "emphasize"


def _frame_dev_stub(t: float, style: str) -> list[list[float]]:
    pose = deepcopy(_REST_POSE)
    phase = t * math.pi * 2
    breathe = 0.012 * math.sin(phase * 2)
    pose[0][1] += breathe
    pose[3][1] += breathe * 0.6

    if style == "wave":
        wave = math.sin(phase * 3)
        pose[17][0] -= 0.06
        pose[17][1] += 0.14
        pose[19][0] += 0.10
        pose[19][1] += 0.50
        pose[19][2] -= 0.04
        pose[21][0] += 0.20 + 0.12 * wave
        pose[21][1] += 0.80 + 0.08 * wave
        pose[21][2] -= 0.04 + 0.06 * math.sin(phase * 3 - 0.4)
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
    elif style == "walk":
        stride = math.sin(phase * 2)
        arm = math.sin(phase * 2 + math.pi)
        pose[1][2] += stride * 0.18
        pose[4][2] += stride * 0.22
        pose[7][2] += stride * 0.12
        pose[2][2] -= stride * 0.18
        pose[5][2] -= stride * 0.22
        pose[8][2] -= stride * 0.12
        pose[0][0] += math.sin(phase * 4) * 0.02
        pose[0][1] += abs(math.sin(phase * 2)) * 0.03
        pose[16][1] += 0.04
        pose[16][2] += arm * 0.12
        pose[18][1] += 0.03
        pose[18][2] += arm * 0.16
        pose[20][2] += arm * 0.18
        pose[17][1] += 0.04
        pose[17][2] -= arm * 0.12
        pose[19][1] += 0.03
        pose[19][2] -= arm * 0.16
        pose[21][2] -= arm * 0.18
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
    else:
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


def generate_dev_stub_frames(prompt: str, num_frames: int) -> dict[str, Any]:
    style = _style_dev_stub(prompt)
    frames: list[list[list[float]]] = []
    for i in range(num_frames):
        t = i / max(num_frames - 1, 1)
        frames.append(_frame_dev_stub(t, style))
    return {
        "frames": frames,
        "fps": FPS,
        "mode": "dev-stub-not-mdm",
    }


@app.post("/generate")
def generate(body: GenerateBody) -> dict[str, Any]:
    base = _mdm_base_url()
    if base:
        return forward_to_mdm_service(base, body.prompt, body.num_frames)
    if _dev_stub_enabled():
        return generate_dev_stub_frames(body.prompt, body.num_frames)
    raise HTTPException(
        status_code=503,
        detail=(
            "Configure MDM_SERVICE_URL to your MDM inference API (POST /generate), "
            "or set MOTION_DEV_STUB=1 for local stub motion only."
        ),
    )


@app.get("/health")
def health() -> dict[str, str]:
    base = _mdm_base_url()
    if base:
        return {"status": "ok", "backend": "mdm-forward", "target": base}
    if _dev_stub_enabled():
        return {"status": "ok", "backend": "dev-stub-not-mdm"}
    return {"status": "degraded", "backend": "none"}
