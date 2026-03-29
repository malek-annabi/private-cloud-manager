# Project Writeup

## Title

Private Cloud Manager: A Local VMware Control Plane with Web UI, Job Orchestration, SSH Access, and OpenClaw Integration

## Overview

Private Cloud Manager is a local infrastructure management platform built for operating VMware Workstation Pro virtual machines hosted on a single machine.

The project was designed to solve a very practical problem: once a homelab or private-cloud setup grows beyond a few VMs, managing everything through the VMware GUI, ad hoc scripts, and terminal windows becomes slow, repetitive, and hard to audit. This project introduces a structured control plane on top of that local environment.

Instead of treating local VMs as isolated desktops, the system treats them like manageable infrastructure:

- inventory is centralized
- actions are routed through a backend API
- operations become jobs with status and logs
- SSH access is available from the browser
- AI tooling can act on the environment through a controlled interface

## Goals

The project focuses on five main goals:

1. Make local VMware VMs manageable through a dedicated web dashboard.
2. Replace direct manual operations with a backend job orchestration model.
3. Provide browser-based SSH access for day-to-day management tasks.
4. Keep an audit trail of actions and system behavior.
5. Extend the platform with an AI operations layer using OpenClaw and Ollama.

## System Design

The project is organized into three components.

### 1. Frontend

The frontend is built with React, Vite, TypeScript, React Query, React Router, Axios, Tailwind CSS, and `xterm`.

It provides the operator-facing interface for:

- viewing VM inventory
- triggering start and stop operations
- monitoring queued and running jobs
- reading job logs
- opening an SSH session to a VM directly from the browser

The frontend is intentionally thin. It does not execute infrastructure actions directly. Instead, it delegates all operational behavior to the backend API.

### 2. Backend

The backend is built with Express, TypeScript, Prisma, SQLite, `ssh2`, `ws`, and VMware's `vmrun` tooling.

It is responsible for:

- exposing the VM and job APIs
- loading inventory into a local database
- executing VM lifecycle actions
- processing SSH command jobs
- managing a WebSocket-based interactive SSH session
- storing job state and logs
- recording audit events

This separation is important because it creates a real control plane. The UI, future automation, and AI assistants all use the same backend surface instead of bypassing it.

### 3. OpenClaw Plugin

The OpenClaw plugin exposes the platform to an AI assistant as a set of explicit tools:

- `pcm_list_vms`
- `pcm_start_vm`
- `pcm_stop_vm`
- `pcm_ssh_exec`
- `pcm_get_job_status`

OpenClaw runs with a local Ollama model, while the plugin turns the backend into an operational tool layer. This means the assistant does not need direct access to VMware or the host shell to perform actions. It operates through the same API and job system that the human dashboard uses.

That is a strong architectural choice because it keeps policy, logging, and operational behavior centralized.

## Workflow

The overall workflow is:

1. VM metadata is defined in inventory and loaded into the backend database.
2. The frontend calls the backend API to list VMs or create jobs.
3. The backend creates job records and background workers process them.
4. Job logs and status updates are stored and exposed through API endpoints.
5. The frontend polls for updates and presents them in the dashboard.
6. OpenClaw can call the same backend operations through the plugin tools.

## Notable Features

### Inventory-Driven VM Management

VMs are registered in a structured inventory file and loaded into the local database. This makes the environment discoverable and manageable through a consistent model rather than relying on manual per-VM handling.

### Job-Based Operations

Actions such as starting or stopping a VM are represented as jobs. This gives the platform:

- better operational visibility
- retry and approval potential
- auditability
- a cleaner future path toward scheduling or automation

### Browser-Based SSH

The platform includes an SSH terminal inside the web interface using WebSockets and `xterm`, which makes it possible to access a VM without leaving the dashboard.

### AI Operations Layer

By connecting the backend to OpenClaw through a custom plugin, the project extends from a dashboard into an AI-assisted infrastructure management platform. A local model running in Ollama can inspect inventory and invoke controlled operations through named tools.

This is one of the strongest aspects of the project because it demonstrates how local AI can be integrated into infrastructure management without giving the model unsafe direct shell access.

## Technical Challenges Solved

Several practical issues had to be handled during development:

- designing a clean separation between UI, orchestration, and execution
- building a WebSocket SSH bridge for interactive terminal access
- handling job state and logs in a simple local-first architecture
- integrating VMware command execution through `vmrun`
- exposing the platform to OpenClaw in a way that the assistant can use reliably
- debugging plugin registration and runtime config flow in OpenClaw

The OpenClaw integration was especially interesting because it required aligning the plugin implementation with the runtime conventions actually used by OpenClaw's working built-in extensions.

## Why This Project Matters

This project sits at the intersection of:

- homelab and private infrastructure operations
- internal platform engineering
- local-first tooling
- AI-assisted operations

It shows that "private cloud" does not always need to mean a large distributed system. Even a VMware Workstation environment on a single host can benefit from platform thinking: inventory, API surfaces, orchestration, logging, policy, and operator tooling.

It also demonstrates a realistic pattern for AI integration:

- keep AI out of direct host execution paths
- expose safe operational tools instead
- reuse the same backend used by humans

## Recommended GitHub Publishing Strategy

The best current strategy is a single repository with three top-level folders.

Why this is the best fit:

- the frontend, backend, and plugin belong to one product
- the OpenClaw plugin is tightly coupled to the backend API
- a single repo makes the architecture easier to understand
- it simplifies setup, documentation, and demos
- it keeps the project narrative coherent for GitHub and LinkedIn readers

Recommended structure:

- `/frontend`
- `/backend`
- `/openclaw-plugin-private-cloud-manager`
- `/docs`
- root `README.md`

Later, if the OpenClaw plugin becomes generic enough to support multiple backends, it can be extracted into a standalone repository.

## Future Directions

Potential next steps for the project include:

- VM current state visibility for power status such as on and off
- richer VM status and health reporting
- snapshot lifecycle management
- approval flows for sensitive actions
- improved policy enforcement for SSH commands
- audit views in the frontend
- authentication and access management
- role-based access controls
- multi-host inventory
- automation and scheduled jobs
- natural-language operational workflows through OpenClaw

## Summary

Private Cloud Manager turns a locally hosted VMware environment into a structured, extensible operations platform. It combines a web dashboard, a job-oriented backend, browser-based SSH access, and an AI tool layer powered by OpenClaw and Ollama.

It is a strong example of local infrastructure treated with real platform engineering principles, and it shows how AI can be integrated into infrastructure workflows in a controlled and practical way.
