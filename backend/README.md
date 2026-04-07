# Backend

The backend is the execution and orchestration layer for Private Cloud Manager.

Built with:

- Express
- TypeScript
- Prisma
- SQLite
- `ssh2`
- `ws`
- VMware `vmrun`

## What It Does

The backend is responsible for:

- loading inventory into the local database
- exposing VM, job, audit, and readiness APIs
- executing VMware lifecycle operations
- running background job handlers
- exposing interactive SSH sessions over WebSocket
- persisting job logs and audit events
- tracking VM activity such as `last seen online` and `last SSH login`
- running managed Linux and Windows update jobs and persisting patch metadata
- refreshing remote OS family/version and reboot-needed state on interactive SSH connect
- exposing lightweight API traffic telemetry for dashboard charts

## Important Routes

- `GET /api/health`
- `GET /api/vms`
- `GET /api/vms/:id`
- `POST /api/vms`
- `GET /api/vms/:id/ssh-ready`
- `GET /api/vms/:id/update-feed`
- `PATCH /api/vms/:id/tags`
- `PATCH /api/vms/:id/connection`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/start-vm`
- `POST /api/jobs/stop-vm`
- `POST /api/jobs/ssh`
- `POST /api/jobs/update-vm`
- `GET /api/audit`
- `GET /api/metrics/traffic`

## Database Model

Prisma uses a local SQLite database at:

```text
backend/dev.db
```

The main records are:

- `VM`
- `Job`
- `JobLog`
- `AuditEvent`

The `VM` record is the live operational copy of your inventory. It stores:

- static bootstrap data from `inventory.json`
- live power state derived from VMware
- SSH connection details that can be edited from the UI
- UI/API-created VM records that live in SQLite without modifying the private inventory bootstrap file
- activity metadata such as `lastSeenOnlineAt` and `lastSshLoginAt`
- OS patch metadata such as `osFamily`, `osVersion`, `lastUpdatedAt`, and `rebootRequired`

The real inventory bootstrap file stays local at:

```text
backend/src/data/inventory.json
```

The public template is:

```text
backend/src/data/inventory.example.json
```

## Run Locally

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Default URL:

```text
http://127.0.0.1:8000
```

## Notes

- API auth is bearer-token based
- if `API_TOKEN` is not set, the fallback token is `dev-token`
- background jobs are processed by the worker
- interactive SSH is handled separately through the WebSocket server
- VMware inventory is bootstrapped from `backend/src/data/inventory.json`
- the real inventory file should stay private and untracked
- Linux update jobs depend on working SSH credentials and `sudo` privileges on the guest; Windows update jobs depend on Windows OpenSSH and Windows Update Agent availability
- interactive SSH sessions also refresh OS family/version and reboot-required state
- `GET /api/vms/:id/update-feed` gives an on-demand package change feed for Ubuntu, Debian, Kali, and Windows, including security candidates when classification is available and kernel/core/cumulative/servicing-stack highlights
- `GET /api/metrics/traffic` gives in-memory frontend/backend API traffic buckets for the dashboard
- `FG-VM` is treated as critical lab infrastructure and routine stop actions are guarded unless an explicit override is provided

## Setup Checklist

1. Copy `src/data/inventory.example.json` to `src/data/inventory.json`
2. Fill in:
   - VM ids and names
   - valid `.vmx` paths
   - SSH host/user/port
   - either `password` or `privateKeyPath`
   - optional OS hints such as Ubuntu, Debian, Kali, or Windows `family` and `version`
3. Make sure `vmrun.exe` is available where the adapter expects it
4. Run `npx prisma generate` and `npx prisma db push`
5. Start the backend and check `GET /api/health`

## Update Flow

Managed Linux and Windows updates go through `POST /api/jobs/update-vm`.

The backend:

- validates that the VM is update-eligible
- connects over SSH through the existing backend control path
- runs package maintenance as a job
- stores `lastUpdatedAt`
- refreshes `osVersion`
- records whether a reboot is required

Even outside the update job, an interactive SSH login will also refresh OS metadata so the control plane stays reasonably current.

Before patching, the frontend or OpenClaw can call `GET /api/vms/:id/update-feed?mode=security` to inspect pending package changes. The feed is generated on demand over SSH, so it stays current without background polling.
