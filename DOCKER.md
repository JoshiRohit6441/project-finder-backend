# Backend Docker

Run from this `backend/` folder. Frontend is not in Docker — use `cd ../frontend && npm run dev`.

## Dev

```bash
docker compose -f docker-compose.dev.yml up --build
```

API: http://localhost:4000/health  
Panel: http://localhost:5173 (Vite, proxies `/api` here)

## Production (API + workers + data only)

```bash
docker compose up --build -d
```

API still on http://localhost:4000. Start the UI separately with `npm run dev` or `npm run build` in `frontend/`.

`.env` lives in this folder. Copy `.env.example` if needed.
