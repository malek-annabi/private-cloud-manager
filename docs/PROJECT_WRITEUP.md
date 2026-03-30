# Project Writeup

## Title

Private Cloud Manager: A Local VMware Control Plane with Real-Time Status, Browser SSH, Auditability, and OpenClaw Integration

## Overview

Private Cloud Manager is a local infrastructure platform for operating VMware Workstation Pro virtual machines hosted on a single machine. The goal is to treat a workstation-based private cloud with real platform engineering ideas instead of relying only on the VMware GUI, scattered scripts, and manual SSH workflows.

Today the system provides:

- a token-gated operator dashboard
- live VM power-state visibility
- per-VM `last online` and `last SSH login` activity signals
- job-based lifecycle actions with logs and timestamps
- audit visibility for actions and API activity
- a browser-based multi-tab SSH workspace
- a managed Ubuntu server update workflow with OS version and patch metadata
- automatic OS metadata refresh on interactive SSH connect
- an OpenClaw plugin for local AI-assisted operations through Ollama

## Architecture

The project is organized into three components.

### Frontend

The frontend is built with React, Vite, TypeScript, React Query, React Router, Axios, Tailwind CSS, and `xterm`.

It is responsible for:

- VM inventory and live power-state presentation
- token-gated UI access
- jobs and audit views
- editable SSH connection details
- multi-session browser SSH with tabbed terminals

### Backend

The backend is built with Express, TypeScript, Prisma, SQLite, `ssh2`, `ws`, and VMware `vmrun`.

It is responsible for:

- normalizing inventory into the local database
- exposing VM, job, audit, and SSH readiness APIs
- executing VM lifecycle operations
- running background workers for job processing
- exposing WebSocket-based interactive SSH sessions
- recording audit events and VM activity timestamps

### OpenClaw Plugin

The OpenClaw plugin exposes the backend as explicit tools:

- `pcm_list_vms`
- `pcm_start_vm`
- `pcm_stop_vm`
- `pcm_ssh_exec`
- `pcm_get_job_status`

This keeps the AI layer on the same backend pathways as the human UI instead of giving the model direct host-shell control.

## Workflow

The current operator flow is:

1. VM metadata is defined in the local inventory and loaded into the backend database.
2. The frontend lists VMs, jobs, and audit activity from backend APIs.
3. Start and stop requests become jobs that are processed by the worker.
4. The frontend polls for updates and surfaces state, logs, and timestamps.
5. SSH can be opened directly from the dashboard.
6. If a VM is powered off, the SSH workspace can start it, wait for SSH readiness, and then open a terminal tab automatically.
7. OpenClaw can call the same operational backend through named tools.

## Notable Features

### Live VM State and Activity

The dashboard now shows:

- whether a VM is running, off, or unknown
- when a VM was last seen online
- when a VM last accepted an interactive SSH login
- the latest detected OS version after SSH contact or managed updates

That makes the system feel much more like a real control plane than a static inventory list.

### Job Visibility

Lifecycle operations are represented as jobs with:

- queued and running states
- created and updated timestamps
- per-job logs
- a detail view for execution history

This gives the platform clearer observability and a stronger path toward approvals, retries, and automation.

### Audit Trail

The backend records audit events and the frontend exposes them through a dedicated audit page. That gives the platform traceability across VM actions, job execution, and API operations.

### Browser SSH Workspace

The SSH experience evolved from a single embedded terminal into a tabbed operator workspace:

- open multiple SSH tabs
- open multiple tabs for the same VM
- edit SSH connection details from the UI
- boot a powered-off VM and connect automatically once SSH is reachable

This is one of the biggest usability improvements in the project so far.

### Managed Ubuntu Updates

Because most of the environment runs Ubuntu Server 22.04 or 24.04, the platform now exposes a first-class update operation instead of relying on arbitrary SSH commands. The backend can queue a managed update job, run package maintenance over SSH, detect the current OS version, persist `last updated` metadata, and record whether a reboot is required.

That keeps patching on the same audited backend path as the rest of the platform.

The platform also refreshes OS family, OS version, and reboot-needed state whenever an interactive SSH session is established. That keeps VM metadata current even if a machine was patched outside the dashboard.

### AI Operations Layer

By integrating OpenClaw and Ollama through a custom plugin, the project supports local AI-assisted operations without bypassing the backend. The model does not execute directly on the host; it uses explicit tools that call the same backend APIs as the human interface.

## Why This Project Matters

This project sits at the intersection of:

- homelab and private infrastructure operations
- internal platform engineering
- local-first tooling
- AI-assisted operations

It shows that even a VMware Workstation environment on a single machine can benefit from platform thinking:

- inventory
- APIs
- orchestration
- logs
- auditability
- controlled AI tooling

It also demonstrates a practical AI pattern:

- keep AI out of direct host execution paths
- expose safe operational tools instead
- reuse the same backend surface used by humans

## Recommended GitHub Strategy

The best fit remains one repository with:

- `/frontend`
- `/backend`
- `/openclaw-plugin-private-cloud-manager`
- `/docs`
- root `README.md`

That keeps the architecture coherent, the setup simple, and the project story easy to understand for contributors, recruiters, and other builders.

## Future Directions

Likely next steps include:

- transitional VM states such as `booting` and `stopping`
- richer SSH readiness diagnostics
- snapshot lifecycle management
- stronger authentication and access management
- approval flows for sensitive actions
- more OpenClaw tools and natural-language workflows
- multi-host support

## Summary

Private Cloud Manager turns a locally hosted VMware environment into a structured and extensible operations platform. It combines a modern web dashboard, a job-oriented backend, browser-based SSH, audit visibility, and an AI tool layer powered by OpenClaw and Ollama.

The project is a strong example of local infrastructure treated with real platform engineering principles, while keeping the AI integration practical and controlled.
