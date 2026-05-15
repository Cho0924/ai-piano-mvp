# AI Piano MVP

Frontend (Next.js) records audio, backend (FastAPI + Basic Pitch + pretty_midi) converts to MIDI and sends analysis to Gemini.

## System overview

1. Frontend records microphone audio in the browser.
2. Audio is uploaded to the backend API.
3. Basic Pitch generates MIDI from the audio.
4. pretty_midi converts MIDI into a JSON summary.
5. Gemini analyzes the JSON and returns feedback as "Chou Sensei".
6. Frontend displays the feedback and MIDI JSON preview.

## Project structure

- frontend: Next.js app
- backend: FastAPI app (uv + Python)

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Backend (uv)

```bash
source .venv/bin/activate
uv sync
```

```bash
uvicorn app.main:app --reload --port 8000
```

## Notes

- Basic Pitch supports Python 3.7-3.11 (Mac M1 recommends 3.10).
- Supported audio types: wav, mp3, ogg, flac, m4a.
