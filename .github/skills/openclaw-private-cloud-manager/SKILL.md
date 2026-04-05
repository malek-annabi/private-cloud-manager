---
name: openclaw-private-cloud-manager
description: "Use when you want step-by-step OpenClaw + Ollama setup and usage guidance for the Private Cloud Manager OpenClaw plugin."
---

# OpenClaw Private Cloud Manager Skill

## Purpose
Help users configure and use the `private-cloud-manager` OpenClaw plugin from within the workspace, including local plugin install, OpenClaw config, Ollama provider setup, and safe tool usage.

## When to Use
- you want to connect OpenClaw to the local Private Cloud Manager backend
- you need the exact plugin tools and allowlist for PCM operations
- you want the correct plugin install and restart workflow for local development
- you need guidance on using Ollama as the OpenClaw model provider

## Setup Workflow
1. Install the local plugin
   - `openclaw plugins install -l D:\Projects\private-cloud-manager\openclaw-plugin-private-cloud-manager`
2. Configure OpenClaw plugin load paths and enable the plugin
   - add `D:\Projects\private-cloud-manager\openclaw-plugin-private-cloud-manager` to `plugins.load.paths`
   - allow `private-cloud-manager` in `plugins.allow`
3. Configure plugin runtime options
   - `baseUrl`: `http://127.0.0.1:8000/api`
   - `token`: `dev-token` or use `PCM_TOKEN`
   - `timeoutMs`: `15000`
4. Allow PCM tools for the agent
   - set `agents[0].tools.alsoAllow` to the full PCM tool list
5. Restart OpenClaw after any plugin or config change

## PCM Tool Set
- `pcm_list_vms`
- `pcm_start_vm`
- `pcm_stop_vm`
- `pcm_ssh_exec`
- `pcm_get_job_status`
- `pcm_update_vm`
- `pcm_get_update_feed`
- `pcm_refresh_vm_state`
- `pcm_reboot_vm`
- `pcm_get_traffic_metrics`
- `pcm_rotate_security_updates`
- `pcm_fire_lab`
- `pcm_stop_lab`

## Ollama Guidance
- OpenClaw manages the model provider; the plugin does not call Ollama directly.
- Use Ollama provider config pointing to `http://127.0.0.1:11434`.
- Start Ollama locally with `ollama serve` and pull a model like `qwen2.5:7b-instruct-q4_K_M`.
- Trust structured tool results first; smaller local models may narrate correctly but still invent around outputs.

## Recommended Validation
- verify the backend is reachable at `http://127.0.0.1:8000/api`
- verify the PCM token is configured or environment variables are set
- verify `private-cloud-manager` is installed and enabled in OpenClaw
- verify the PCM tools are allowed for the agent and OpenClaw has been restarted

## Recommended Prompts
- "Show me the current PCM tools and how to configure them in OpenClaw."
- "Help me install and enable the Private Cloud Manager plugin in OpenClaw."
- "What config do I need for Ollama to power OpenClaw with the PCM plugin?"
- "How do I re-install the local plugin after code changes?"
