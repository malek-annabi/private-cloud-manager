# Frontend

The frontend is the operator-facing dashboard for Private Cloud Manager.

Built with:

- React
- Vite
- TypeScript
- React Query
- React Router
- Tailwind CSS
- `xterm`

## What It Does

The frontend currently provides:

- token-gated access to the web interface
- live VM inventory with power-state visibility
- per-VM `last online` and `last SSH login` activity indicators
- start and stop actions with state-aware buttons
- editable SSH connection details
- managed Ubuntu server update action with OS version and patch metadata
- automatic OS metadata refresh after interactive SSH login
- jobs view with timestamps and detail logs
- audit view with action metadata
- multi-session browser SSH with tabbed terminals

## Main Areas

- `src/pages/VMs.tsx`
  - inventory view
  - SSH tab workspace
  - activity indicators
  - tag and connection editing

- `src/pages/Jobs.tsx`
  - recent job activity
  - job status and timestamps

- `src/pages/JobDetail.tsx`
  - detailed job log timeline

- `src/pages/Audit.tsx`
  - audit trail for operator and API actions

- `src/components/ssh/Terminal.tsx`
  - browser SSH terminal built on `xterm`

## Run Locally

```bash
npm install
npm run dev
```

Default URL:

```text
http://127.0.0.1:5173
```

## Notes

- The frontend talks to the backend at `http://127.0.0.1:8000/api`
- API auth is bearer-token based
- VM state and jobs are refreshed through polling
- SSH sessions are opened over WebSocket through the backend
