# OpenClaw Plugin: Private Cloud Manager

This plugin lets OpenClaw call the existing private-cloud-manager backend as a set of agent tools instead of inventing a second AI-only API.

## Tools

- `pcm_list_vms`
- `pcm_create_vm`
- `pcm_update_vm_settings`
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

These tools call the backend routes that already exist today:

- `GET /api/vms`
- `POST /api/vms`
- `PATCH /api/vms/:id/settings`
- `POST /api/jobs/start-vm`
- `POST /api/jobs/stop-vm`
- `POST /api/jobs/ssh`
- `GET /api/jobs/:id`
- `POST /api/jobs/update-vm`
- `POST /api/vms/:id/refresh-state`
- `POST /api/jobs/reboot-vm`
- `GET /api/metrics/traffic`

## Suggested OpenClaw config

Add the plugin folder to OpenClaw's plugin load paths, then configure the plugin entry.

Install it from the local folder during development:

```powershell
openclaw plugins install -l D:\Projects\private-cloud-manager\openclaw-plugin-private-cloud-manager
```

Example shape:

```json
{
  "plugins": {
    "allow": [
      "private-cloud-manager"
    ],
    "load": {
      "paths": [
        "D:\\Projects\\private-cloud-manager\\openclaw-plugin-private-cloud-manager"
      ]
    },
    "entries": {
      "private-cloud-manager": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8000/api",
          "token": "dev-token",
          "timeoutMs": 15000
        }
      }
    }
  }
}
```

After updating OpenClaw config, restart the OpenClaw gateway.

Also allow the individual PCM tools for the agent that should use them:

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "alsoAllow": [
            "pcm_list_vms",
            "pcm_create_vm",
            "pcm_update_vm_settings",
            "pcm_start_vm",
            "pcm_stop_vm",
            "pcm_ssh_exec",
            "pcm_get_job_status",
            "pcm_update_vm",
            "pcm_get_update_feed",
            "pcm_refresh_vm_state",
            "pcm_reboot_vm",
            "pcm_get_traffic_metrics",
            "pcm_rotate_security_updates",
            "pcm_fire_lab",
            "pcm_stop_lab"
          ]
        }
      }
    ]
  }
}
```

If you update the plugin code locally, reinstall it and restart OpenClaw:

```powershell
openclaw plugins install -l D:\Projects\private-cloud-manager\openclaw-plugin-private-cloud-manager
```

If you prefer not to keep secrets in OpenClaw config, you can also provide these as environment variables for the Gateway process:

- `PCM_BASE_URL`
- `PCM_TOKEN`
- `PCM_TIMEOUT_MS`

If you do want to keep the token in OpenClaw config, add:

```json
"token": "dev-token"
```

## Ollama

This plugin does not talk to Ollama directly. OpenClaw handles the model, and the model calls these tools.

Use Ollama as the OpenClaw model provider, then allow the assistant to use the `private-cloud-manager` plugin tools.

Example Ollama provider shape in `openclaw.json`:

```json
{
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434",
        "api": "ollama"
      }
    }
  }
}
```

Example local model startup:

```powershell
ollama serve
ollama pull qwen2.5:7b-instruct-q4_K_M
```

Smaller local models can still narrate tool calls imperfectly even when the tool invocation is correct. The safest pattern is to trust the structured tool result first, then tune model choice and OpenClaw workspace guidance as needed.

## Recommended OpenClaw Workspace Notes

These are optional but helpful:

- `USER.md`: operator profile and preferences
- `IDENTITY.md`: assistant persona
- `TOOLS.md`: grounding rules such as “do not claim a tool ran unless this turn shows it”

These files improve consistency, but they are not what makes the plugin functional. The plugin works when:

- the backend is reachable
- the token is configured
- the PCM tools are allowed
- OpenClaw has been restarted after changes

## Notes

- `pcm_ssh_exec` still goes through your backend approval and SSH policy logic.
- `pcm_create_vm` registers a VM in the PCM database with a generic OS family; it does not edit `inventory.json`.
- `pcm_update_vm_settings` updates the database record for an existing VM, including VMX path, OS family, tags, and SSH workflow fields; it also does not edit `inventory.json`.
- `pcm_start_vm` and `pcm_stop_vm` create normal backend jobs, so the dashboard and OpenClaw stay in sync.
- `pcm_update_vm` queues a managed update job for Ubuntu, Debian, Kali, or Windows through the same backend job and audit flow.
- `pcm_get_update_feed` retrieves an on-demand package change feed with security, kernel, cumulative, servicing-stack, and other critical-package highlights before patching when classification is available.
- `pcm_refresh_vm_state` pulls live VM guest metadata back into the control plane, which is useful after reboots or guest-side changes.
- `pcm_reboot_vm` queues a soft or hard reboot job through the same backend controls as the UI.
- `pcm_get_traffic_metrics` exposes the dashboard's frontend/backend API traffic telemetry to OpenClaw.
- `pcm_rotate_security_updates` uses that feed as a gate and queues only the safer security-only patch jobs, while holding VMs that show critical or kernel-class changes.
- `pcm_fire_lab` queues the first lab presets: Blue Team, Red Team, Purple Team, and WG-VPN.
- `pcm_stop_lab` queues lab shutdowns and can optionally include `FG-VM` through an explicit critical-infrastructure override.
- If you later add snapshot, release, cancel, audit, or live terminal tools, this plugin is the right place to expose them.
