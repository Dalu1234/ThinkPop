import base64
import json
import os
import sys

import riva.client


DEFAULT_URI = "grpc.nvcf.nvidia.com:443"
DEFAULT_FUNCTION_ID = "d8dd4e9b-fbf5-4fb0-9dba-8cf436c8d965"
DEFAULT_LANGUAGE = "en-US"


def fail(message: str, code: int = 1) -> None:
    sys.stderr.write(message + "\n")
    raise SystemExit(code)


def main() -> None:
    api_key = os.getenv("NVIDIA_API_KEY", "").strip()
    if not api_key:
        fail("Missing NVIDIA_API_KEY for NVIDIA Parakeet STT.")

    raw = sys.stdin.read()
    if not raw.strip():
        fail("Missing STT request payload.")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        fail("Invalid STT request payload.")

    audio_base64 = str(payload.get("audio_base64") or "").strip()
    if not audio_base64:
        fail("Missing audio_base64 in STT payload.")

    sample_rate_hertz = int(payload.get("sample_rate_hertz") or 16000)
    language_code = str(payload.get("language_code") or os.getenv("NVIDIA_STT_LANGUAGE") or DEFAULT_LANGUAGE)
    uri = os.getenv("NVIDIA_GRPC_URI", "").strip() or DEFAULT_URI
    function_id = os.getenv("NVIDIA_FUNCTION_ID", "").strip() or DEFAULT_FUNCTION_ID

    try:
        audio_bytes = base64.b64decode(audio_base64)
    except Exception as exc:
        fail(f"Could not decode audio payload: {exc}")

    metadata = [
        ["function-id", function_id],
        ["authorization", f"Bearer {api_key}"],
    ]
    auth = riva.client.Auth(use_ssl=True, uri=uri, metadata_args=metadata)
    asr = riva.client.ASRService(auth)
    config = riva.client.RecognitionConfig(
        encoding=riva.client.AudioEncoding.LINEAR_PCM,
        sample_rate_hertz=sample_rate_hertz,
        language_code=language_code,
        max_alternatives=1,
        enable_automatic_punctuation=True,
    )

    try:
        response = asr.offline_recognize(audio_bytes, config)
    except Exception as exc:
        fail(f"NVIDIA Parakeet STT failed: {exc}")

    transcripts = []
    for result in response.results:
        if result.alternatives:
            transcript = result.alternatives[0].transcript.strip()
            if transcript:
                transcripts.append(transcript)

    sys.stdout.write(json.dumps({"text": " ".join(transcripts)}))


if __name__ == "__main__":
    main()
