import json
import os
import tempfile
import uuid
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from basic_pitch.inference import predict
import pretty_midi

load_dotenv()

app = FastAPI()

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


def midi_to_json(midi_data: pretty_midi.PrettyMIDI) -> dict[str, Any]:
    instruments = []
    for instrument in midi_data.instruments:
        notes = [
            {
                "pitch": int(note.pitch),
                "start": float(note.start),
                "end": float(note.end),
                "velocity": int(note.velocity)
            }
            for note in instrument.notes
        ]
        instruments.append(
            {
                "name": instrument.name,
                "program": int(instrument.program),
                "is_drum": bool(instrument.is_drum),
                "note_count": int(len(notes)),
                "notes": notes
            }
        )

    time_signatures = [
        {
            "time": float(ts.time),
            "numerator": int(ts.numerator),
            "denominator": int(ts.denominator)
        }
        for ts in midi_data.time_signature_changes
    ]

    return {
        "duration": float(midi_data.get_end_time()),
        "estimated_tempo": float(midi_data.estimate_tempo()),
        "time_signatures": time_signatures,
        "instrument_count": int(len(instruments)),
        "instruments": instruments
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = os.path.splitext(file.filename)[-1] or ".wav"
    if suffix.lower() not in {".wav", ".mp3", ".ogg", ".flac", ".m4a"}:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    temp_name = f"{uuid.uuid4().hex}{suffix}"

    with tempfile.TemporaryDirectory() as temp_dir:
        audio_path = os.path.join(temp_dir, temp_name)
        with open(audio_path, "wb") as audio_file:
            audio_file.write(await file.read())

        try:
            _, midi_data, _ = predict(audio_path)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Basic Pitch error: {exc}")

    midi_json = midi_to_json(midi_data)

    prompt = build_prompt(midi_json)
    try:
        client = genai.Client(api_key=api_key)
        model_name = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
        response = client.models.generate_content(model=model_name, contents=prompt)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Gemini API error: {exc}")

    return {
        "feedback": response.text or "",
        "midi": midi_json
    }


def build_prompt(midi_json: dict[str, Any]) -> str:
    midi_text = json.dumps(midi_json, ensure_ascii=False, indent=2)
    return (
        "あなたは厳しくも温かいピアノ講師『チョウ先生』です。\n"
        "以下のMIDI解析JSONを基に、演奏の良かった点、改善点、具体的な練習メニューを日本語でフィードバックしてください。\n"
        "形式: 1. 良かった点 2. 改善点 3. 練習メニュー\n"
        "大人の初心者が理解しやすいように、専門用語を使う時は説明を加えて説明してください。\n"
        "フィードバックは長くなりすぎないよう、要点を絞ってください。\n\n"
        f"MIDI解析JSON:\n{midi_text}"
    )
