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
- compact fleet stats and recent SSH/update cadence widgets
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
- the login token is the same backend bearer token used by the API

## Setup Checklist

1. Make sure the backend is already running and reachable
2. Install dependencies with `npm install`
3. Start the frontend with `npm run dev`
4. Open `http://127.0.0.1:5173`
5. Log in with the backend API token
6. Verify:
   - VM inventory loads
   - power-state badges update
   - jobs and audit pages respond
   - SSH opens for running VMs

## Operator Flow

Typical operator flow from the UI:

1. Review fleet state and per-VM activity
2. Start or stop a VM through jobs
3. Edit SSH target details if a guest IP changes
4. Open one or more SSH tabs
5. Queue a managed Ubuntu update when needed
6. Check Jobs and Audit for history and results
