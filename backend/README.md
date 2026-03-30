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
- running managed Ubuntu update jobs and persisting patch metadata
- refreshing remote OS family/version and reboot-needed state on interactive SSH connect

## Important Routes

- `GET /api/health`
- `GET /api/vms`
- `GET /api/vms/:id`
- `GET /api/vms/:id/ssh-ready`
- `PATCH /api/vms/:id/tags`
- `PATCH /api/vms/:id/connection`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/start-vm`
- `POST /api/jobs/stop-vm`
- `POST /api/jobs/ssh`
- `POST /api/jobs/update-vm`
- `GET /api/audit`

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
