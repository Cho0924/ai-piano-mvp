# AI Piano Backend

FastAPI + Basic Pitch + pretty_midi + Gemini API for audio analysis.

## Setup (uv)

```bash
cd backend
uv venv
source .venv/bin/activate
uv sync
```

Create a `.env.local` file and set `GEMINI_API_KEY`.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```
