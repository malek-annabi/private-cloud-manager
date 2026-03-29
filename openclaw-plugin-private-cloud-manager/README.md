# OpenClaw Plugin: Private Cloud Manager

This plugin lets OpenClaw call the existing private-cloud-manager backend as a set of agent tools instead of inventing a second AI-only API.

## Tools

- `pcm_list_vms`
- `pcm_start_vm`
- `pcm_stop_vm`
- `pcm_ssh_exec`
- `pcm_get_job_status`

These tools call the backend routes that already exist today:

- `GET /api/vms`
- `POST /api/jobs/start-vm`
- `POST /api/jobs/stop-vm`
- `POST /api/jobs/ssh`
- `GET /api/jobs/:id`

## Suggested OpenClaw config

Add the plugin folder to OpenClaw's plugin load paths, then configure the plugin entry.

Install it from the local folder during development:

```powershell
openclaw plugins install -l D:\Projects\private-cloud-manager\openclaw-plugin-private-cloud-manager
```

Example shape:

```json
{
  "tools": {
    "allow": [
      "private-cloud-manager"
    ]
  },
  "plugins": {
    "enabled": true,
    "entries": {
      "private-cloud-manager": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8000/api",
          "timeoutMs": 15000
        }
      }
    }
  }
}
```

After updating OpenClaw config, restart the OpenClaw gateway.

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

## Notes

- `pcm_ssh_exec` still goes through your backend approval and SSH policy logic.
- `pcm_start_vm` and `pcm_stop_vm` create normal backend jobs, so the dashboard and OpenClaw stay in sync.
- If you later add snapshot, release, cancel, audit, or live terminal tools, this plugin is the right place to expose them.
