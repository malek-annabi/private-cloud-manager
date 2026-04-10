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
- live database-backed VM inventory with power-state visibility
- per-VM `last online` and `last SSH login` activity indicators
- compact fleet stats and recent SSH/update cadence widgets
- job volume and frontend/backend traffic charts
- start and stop actions with state-aware buttons
- editable SSH connection details
- two-plane VM modals with separate Guest management and VMware Workstation management views
- UI-based VM registration for existing VMX paths
- UI-based VMware Workstation provisioning from ISO with CPU, RAM, disk, and network inputs
- delete VM flows with a checkbox to either remove the record from PCM only or fully delete a powered-off VM from disk through VMware Workstation
- write-only SSH password fields so stored passwords are never returned to the browser
- fixed in-view navigation with smooth jumps between dashboard sections
- managed Linux and Windows update action with OS version and patch metadata
- on-demand security change feed with kernel/core package highlights before patching
- automatic OS metadata refresh after interactive SSH login
- lab preset controls for Blue Team, Red Team, Purple Team, and WG-VPN
- jobs view with timestamps and detail logs
- audit view with action metadata
- multi-session browser SSH with tabbed terminals
- cyber news feed with modal story details
- retractable sidebar for denser operator layout

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
   - created or edited VMs persist after backend restart
   - power-state badges update
   - jobs and audit pages respond
   - SSH opens for running VMs
   - lab preset buttons queue the expected jobs

The UI also surfaces critical infrastructure nodes so the operator can immediately see when a VM is dependency-bearing for the rest of the lab.

## Operator Flow

Typical operator flow from the UI:

1. Review fleet state and per-VM activity
2. Start or stop a VM through jobs
3. Open the Guest or VMware view depending on whether you want SSH/update workflows or Workstation hardware/profile changes
4. Edit SSH target details if a guest IP changes
5. Open one or more SSH tabs
6. Queue a managed Linux or Windows update when needed
7. Inspect the security change feed before sensitive Ubuntu, Debian, Kali, or Windows patching
8. Check Jobs and Audit for history and results
9. Fire or stop a named lab preset, optionally including the gateway on stop
