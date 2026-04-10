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

- storing and serving the database-backed VM inventory
- exposing VM, job, audit, and readiness APIs
- executing VMware lifecycle operations
- provisioning VMware Workstation VMs from ISO-backed specs and applying Workstation hardware/profile changes
- deleting VMs either from PCM only or from disk through VMware Workstation when explicitly requested
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
- `PATCH /api/vms/:id/settings`
- `PATCH /api/vms/:id/workstation-profile`
- `GET /api/vms/:id/ssh-ready`
- `GET /api/vms/:id/update-feed`
- `PATCH /api/vms/:id/tags`
- `PATCH /api/vms/:id/connection`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/start-vm`
- `POST /api/jobs/stop-vm`
- `POST /api/jobs/delete-vm`
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

The `VM` record is the source of truth for your inventory. It stores:

- the registered VM identity and VMware path
- guest-management metadata such as SSH and OS family
- VMware Workstation profile metadata such as folder path, CPU, memory, disk target, ISO, and network mode
- live power state derived from VMware
- SSH connection details that can be edited from the UI
- activity metadata such as `lastSeenOnlineAt` and `lastSshLoginAt`
- OS patch metadata such as `osFamily`, `osVersion`, `lastUpdatedAt`, and `rebootRequired`

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
- the SQLite database is the only source of truth for VM records
- Linux update jobs depend on working SSH credentials and `sudo` privileges on the guest; Windows update jobs depend on Windows OpenSSH and Windows Update Agent availability
- interactive SSH sessions also refresh OS family/version and reboot-required state
- `GET /api/vms/:id/update-feed` gives an on-demand package change feed for Ubuntu, Debian, Kali, and Windows, including security candidates when classification is available and kernel/core/cumulative/servicing-stack highlights
- `GET /api/metrics/traffic` gives in-memory frontend/backend API traffic buckets for the dashboard
- `FG-VM` is treated as critical lab infrastructure and routine stop actions are guarded unless an explicit override is provided
- VM SSH passwords are no longer returned from the API; they are stored separately in encrypted form and looked up only when a backend workflow needs them
- `POST /api/jobs/delete-vm` supports both PCM-only removal and a full delete-from-disk path through VMware Workstation for powered-off VMs

## Setup Checklist

1. Make sure `vmrun.exe` is available where the adapter expects it
2. Run `npx prisma generate` and `npx prisma db push`
3. Start the backend and check `GET /api/health`
4. Add VMs through the UI or `POST /api/vms`
5. For SSH-enabled workflows, fill in host/user/port plus password or private key path
6. Set `osFamily` and optional `osVersion` so update and feed workflows choose the right command path
7. For Workstation provisioning and hardware profile edits, make sure `vmware-vdiskmanager.exe` is also available at the adapter path

## Secret Storage

If you use password-based SSH workflows, set a dedicated encryption key:

```text
PCM_SECRET_KEY=replace-this-with-a-long-random-secret
```

The backend uses that key to encrypt stored VM SSH passwords at rest. If `PCM_SECRET_KEY` is not set, PCM falls back to the API token for local convenience, which is acceptable for a dev/homelab setup but not ideal for a more serious deployment.

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
