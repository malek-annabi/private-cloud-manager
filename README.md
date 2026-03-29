# Private Cloud Manager

![Status](https://img.shields.io/badge/status-in%20progress-2563eb)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb)
![Backend](https://img.shields.io/badge/backend-Express%20%2B%20TypeScript-111827)
![Database](https://img.shields.io/badge/database-Prisma%20%2B%20SQLite-2d3748)
![VMware](https://img.shields.io/badge/virtualization-VMware%20Workstation%20Pro-607078)
![AI Ops](https://img.shields.io/badge/AI%20ops-OpenClaw%20%2B%20Ollama-16a34a)

Private Cloud Manager is a local-first VM control plane for managing VMware Workstation Pro virtual machines from a dedicated web dashboard instead of relying only on the VMware GUI, scattered scripts, and manual terminal workflows.

It combines:

- a React frontend for inventory, jobs, and browser-based SSH
- an Express backend for orchestration, VMware control, and audit logging
- an OpenClaw plugin so a local Ollama-powered assistant can operate the platform through structured tools

## Highlights

- Manage VMware Workstation Pro VMs from a browser
- Build toward real-time VM power visibility such as on/off state
- Execute VM lifecycle operations through a job system
- Track job status and logs in one place
- Open an SSH terminal directly inside the dashboard
- Keep a centralized VM inventory
- Expose the platform to OpenClaw through explicit AI tools
- Reuse the same backend for both human and AI operators

## Why I Built It

Once a local lab grows past a handful of VMs, day-to-day operations start to become noisy:

- too many terminal tabs
- too many one-off commands
- too much dependence on the VMware GUI
- no consistent job history or audit trail

This project brings platform engineering ideas to a local VMware environment by adding:

- inventory
- APIs
- orchestration
- logs
- browser access
- AI-assisted operations

## Screenshots

Add screenshots to `docs/screenshots/` and update the image paths below.

### VM Inventory

![VM Inventory](./docs/screenshots/vm-inventory.png)

### Jobs View

![Jobs View](./docs/screenshots/jobs-view.png)

### Browser SSH Terminal

![SSH Terminal](./docs/screenshots/ssh-terminal.png)

### OpenClaw Tool Use

![OpenClaw Integration](./docs/screenshots/openclaw-tools.png)

## Architecture

### `frontend/`

React + Vite + TypeScript + React Query + Tailwind CSS + `xterm`

Responsibilities:

- display VM inventory
- start and stop VM jobs
- show job detail and logs
- provide interactive SSH access over WebSocket

### `backend/`

Express + TypeScript + Prisma + SQLite + `ssh2` + `ws`

Responsibilities:

- load and persist VM inventory
- expose VM and job APIs
- execute VMware operations through `vmrun`
- run background job handlers
- expose WebSocket SSH sessions
- record audit events

#### How Prisma and the Database Work

Prisma is the ORM layer that defines and accesses the local SQLite database used by the backend.

In this project, Prisma is responsible for:

- defining the database schema in `backend/prisma/schema.prisma`
- generating the Prisma client used by the application
- reading and writing VM, job, job log, and audit event records
- keeping database access consistent across the backend

At runtime, the backend uses a local SQLite database file:

```text
backend/dev.db
```

The main tables and what they do:

- `VM`: stores the normalized VM inventory the backend operates on
- `Job`: stores queued, running, failed, and completed operations
- `JobLog`: stores per-job logs for observability
- `AuditEvent`: stores action traces for auditing

The inventory file is not the database itself. Instead, the flow is:

1. you define VMs in `backend/src/data/inventory.json`
2. the backend reads that file on startup
3. `inventory.service.ts` upserts those records into the `VM` table
4. the frontend and plugin then operate on the database records

So `inventory.json` is the source input, while Prisma + SQLite are the operational state layer.

### Inventory File and Public Example

The real inventory file can contain confidential information such as:

- internal IP addresses
- VM paths
- SSH usernames
- SSH passwords
- SSH private key paths

Because of that, the real file should stay local and out of Git.

Use this local file for your actual environment:

```text
backend/src/data/inventory.json
```

Use this public example as the template:

```text
backend/src/data/inventory.example.json
```

To create your own inventory:

1. Copy `inventory.example.json` to `inventory.json`
2. Replace the example VM ids, names, and `.vmx` paths
3. Add either `password` or `privateKeyPath` for SSH-enabled VMs
4. Keep `inventory.json` private and untracked

Inventory format example:

```json
{
  "vms": [
    {
      "id": "wireguard",
      "name": "WireGuard Gateway",
      "vmxPath": "D:\\Vms\\WireGuard\\wireguard.vmx",
      "type": "PERSISTENT",
      "ssh": {
        "host": "192.168.1.60",
        "port": 22,
        "user": "root",
        "password": "replace-me"
      }
    }
  ]
}
```

### `openclaw-plugin-private-cloud-manager/`

OpenClaw plugin that exposes the backend as tools:

- `pcm_list_vms`
- `pcm_start_vm`
- `pcm_stop_vm`
- `pcm_ssh_exec`
- `pcm_get_job_status`

This lets a local OpenClaw assistant running on top of Ollama interact with the same backend APIs used by the frontend.

## Project Structure

```text
.
├─ frontend/
├─ backend/
├─ openclaw-plugin-private-cloud-manager/
└─ docs/
```

## Local Setup

### Prerequisites

- Node.js installed
- VMware Workstation Pro installed on the host machine
- `vmrun.exe` available at the path expected by the backend
- one or more VMs configured in the backend inventory
- Ollama installed locally if you want the AI integration
- OpenClaw installed locally if you want the AI tool workflow

### 1. Backend Setup

```bash
cd backend
npm install
npm run prisma:generate
npm run dev
```

The backend runs by default at:

```text
http://127.0.0.1:8000
```

Important backend notes:

- the real VM inventory is defined locally in `backend/src/data/inventory.json`
- the public template lives in `backend/src/data/inventory.example.json`
- API auth uses a bearer token
- if `API_TOKEN` is not set, the default fallback is `dev-token`

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs by default at:

```text
http://127.0.0.1:5173
```

### 3. OpenClaw Plugin Setup

Install the local plugin:

```powershell
openclaw plugins install -l D:\Projects\private-cloud-manager\openclaw-plugin-private-cloud-manager
```

Then configure OpenClaw to enable:

- plugin id: `private-cloud-manager`
- tool names:
  - `pcm_list_vms`
  - `pcm_start_vm`
  - `pcm_stop_vm`
  - `pcm_ssh_exec`
  - `pcm_get_job_status`

And add plugin config:

```json
{
  "baseUrl": "http://127.0.0.1:8000/api",
  "token": "dev-token",
  "timeoutMs": 15000
}
```

## Example OpenClaw Prompts

- `Use pcm_list_vms to list my VMs. Do not use exec.`
- `Use pcm_stop_vm with vmId "wireguard". Do not use exec.`
- `Use pcm_get_job_status with a job id returned by the backend.`

## Design Choices

One of the strongest architectural decisions in this project is that the AI layer does not directly control the host. Instead:

- the assistant uses explicit tools
- the tools call the backend API
- the backend remains the single execution layer

That keeps policy, logging, and operational behavior centralized.

## Community

This project is not just about building something useful for my own environment. I want it to be understandable, reusable, and valuable to other people building local labs, private-cloud tooling, and AI-assisted operations workflows.

That is why the public version of the repository includes:

- a real project writeup
- a safe inventory example instead of leaking private infrastructure details
- a documented architecture across frontend, backend, and OpenClaw integration
- a structure that other builders can adapt to their own VMware environments

My goal is to contribute something practical to the community: a concrete example of how local infrastructure, platform engineering, and local AI tooling can work together in a clean and controlled way.

## Repository Strategy

The recommended GitHub strategy for this project is **one repository** with three top-level folders.

Why one repo is the right choice:

- the frontend, backend, and plugin are one product
- the plugin is tightly coupled to the backend API
- setup and demos are simpler in one place
- the architecture is easier for readers and recruiters to understand

If the OpenClaw plugin later becomes generic enough to support multiple backends, it can be extracted into its own repository.

## Documentation

- [Project writeup](./docs/PROJECT_WRITEUP.md)

## Roadmap

- VM current power state visibility (`on` / `off`)
- richer VM status reporting
- snapshot lifecycle support
- frontend audit view
- authentication and access management
- stronger SSH policy controls
- approval flows for sensitive actions
- multi-host support
- more OpenClaw tools and operational workflows
