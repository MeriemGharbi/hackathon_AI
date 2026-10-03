# Vercel deployment

The dashboard and the API deploy as **one** Vercel project from the repository
root. The React build is served as static files and `api/index.py` runs as a
Python function under `/api`, so the browser only ever makes same-origin
requests and `GROQ_API_KEY` never leaves the server.

## Routing

| Path | Served by |
| --- | --- |
| `/` and any client route (`/Water`, `/Reports`, …) | `dist/index.html` (SPA rewrite) |
| `/assets/*` | Vite build output |
| `/api/*` | `api/index.py` FastAPI function |
| `/api/docs` | Swagger UI |

`vercel.json` keeps the SPA rewrite away from `/api/*` so the function always
wins for API calls.

## Project settings

- Root directory: repository root
- Framework preset: Vite (detected from `package.json`)
- Build command: `pnpm build`
- Output directory: `dist`
- Node/pnpm: pinned by `packageManager` in `package.json` and `.mise.toml`

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | for the assistant | Server-side only. `/api/health` reports `llm_configured`. Without it every other page still works; chat returns a clear error. |
| `AGRIRISK_MODEL` | no | Overrides the Groq model id. |
| `AGRIRISK_CORS_ORIGINS` | no | Comma-separated origins. Defaults to `*`, which is correct for same-origin hosting. |
| `AGRIRISK_DAM_CSV` | no | Path to the dam dataset. Defaults to the bundled `dam_data.csv`. |
| `AGRIRISK_DIST` | no | Directory of the built dashboard when FastAPI should serve it. Only needed when running the API as the *only* process (see below). |

## Local verification

The FastAPI app serves the built dashboard itself, so one process is enough:

```powershell
pnpm install
pnpm build
python -m uvicorn api.index:app --port 8001
# open http://127.0.0.1:8001
```

The API is reachable at `http://127.0.0.1:8001/api` and the docs at
`http://127.0.0.1:8001/api/docs`. If `dist/` is missing, the API still runs and
root requests return a `503` explaining how to build the bundle.

For frontend iteration with hot reload, run Vite on a second port and point it
at the API:

```powershell
$env:VITE_API_BASE_URL = "http://127.0.0.1:8001"
pnpm dev
```

`VITE_API_BASE_URL` must be the API **origin** (the client appends `/api`
itself). Leave it unset when the API serves the dashboard.

Run the endpoint checks with:

```powershell
python tests\test_api.py http://127.0.0.1:8001
```

## Known deployment risks

- `requirements.txt` serves both the API and the Streamlit demo
  (`drought.py`, `pages/`), so the function bundle installs Streamlit even
  though the API does not need it. If the build exceeds the function size
  limit, move `streamlit` into a separate `requirements-streamlit.txt` for
  local use and keep only the API dependencies in `requirements.txt`.
- `/api/national`, `/api/map` and `/api/climate` fan out to Open-Meteo for 24
  governorates. Results are cached for five minutes per process, but a cold
  start can be slow; `maxDuration` is set to 60s in `vercel.json`.
- No deployment has been performed from this workspace yet — run
  `vercel deploy` after connecting a project to obtain a public URL.
