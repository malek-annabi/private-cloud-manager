# Runbooks Phase 1

## Purpose

This document defines the first runbook layer for Private Cloud Manager and OpenClaw.

The goal is to turn OpenClaw into a natural-language runbook interface for the lab without introducing unsafe automation or accidental disruption of critical infrastructure.

## Critical Infrastructure Constraint

`FG-VM` is the FortiGate VM that acts as the core NAT gateway and firewall for the lab.

Details:

- `vmId`: `FG-VM`
- `vmxPath`: `E:\Vms\7.0.15\7.0.15.vmx`
- role: network backbone for lab communication and internet access

Implication:

- if `FG-VM` is down, most of the lab cannot communicate internally or reach the internet
- stop actions on `FG-VM` must not be exposed as casual UI actions or easy runbook steps

Phase 1 policy:

- treat `FG-VM` as critical infrastructure
- guard normal stop actions through the PCM UI and API
- allow operators to explicitly include `FG-VM` when stopping a lab

## Runbook Philosophy

Runbooks should be:

- explicit
- safe
- composable
- low-resource
- useful when launched manually

Runbooks should not depend on always-on AI autonomy. They should work well when OpenClaw is started on demand.

## Target Runbooks

### 1. `prepare_vpn_lab`

Natural-language examples:

- `prepare the VPN lab`
- `bring up the vpn environment`

Primary intent:

- make the VPN part of the lab operational and reachable

Expected sequence:

1. Check that `FG-VM` is running
2. If `FG-VM` is off, start it first and treat that as high priority
3. Wait for the gateway VM to become operational
4. Start the VPN-related VM set, beginning with `wireguard`
5. Wait for each target VM to become SSH-ready where applicable
6. Return a summary of what is up, what is reachable, and what failed

Phase 1 backend needs:

- reusable readiness checks
- grouped start orchestration
- a runbook execution model or a safe orchestration layer in the plugin

Phase 1 plugin/tooling:

- `pcm_fire_lab` with `lab: "wg_vpn"`
- `pcm_stop_lab` with `lab: "wg_vpn"` and optional `includeGateway`

Phase 1 UI needs:

- a `Prepare VPN Lab` button in a future Runbooks panel

### 2. `bring_up_blue_team_environment`

Natural-language examples:

- `bring up the blue team environment`
- `start the blue team stack`

Primary intent:

- bring up the SOC/monitoring side of the lab in a predictable order

Expected sequence:

1. Check `FG-VM`
2. Start blue-team VMs in dependency order
3. Wait for reachability or SSH readiness
4. Return a clean summary of which nodes are ready

Likely VM set:

- Wazuh
- Shuffle
- DFIR-IRIS
- MISP
- Grafana/Loki

Exact membership should be driven by VM tags or by a runbook definition list.

Preferred Phase 1 approach:

- define blue-team membership by tag such as `blue-team`

Phase 1 plugin/tooling:

- `pcm_fire_lab` with `lab: "blue_team"`
- `pcm_stop_lab` with `lab: "blue_team"` and optional `includeGateway`

UI needs:

- a `Bring Up Blue Team Environment` button

### 3. `rotate_security_updates`

Natural-language examples:

- `rotate security updates`
- `patch the Ubuntu servers one by one with security updates only`
- `show me the security change feed before patching`

Primary intent:

- queue and monitor security-only patch rotation across eligible Ubuntu VMs, with an operator-readable change feed before anything is applied

Expected sequence:

1. Determine eligible VMs
2. Exclude critical infrastructure unless explicitly included later
3. Pull a security change feed per VM before queueing the patch job
4. Highlight kernel and other core package changes that may justify operator review
5. Queue security-only updates one at a time
6. After each update, inspect job status
7. Record which machines require reboot
8. Return a final patch summary

Preferred Phase 1 eligibility:

- `powerState === ON`
- `osFamily === ubuntu`
- not `FG-VM`
- not templates

Phase 1 plugin/tooling:

- `pcm_get_update_feed` for the change preview
- `pcm_update_vm` with `mode: "security"` for the actual patch action
- a future `pcm_rotate_security_updates` orchestration tool if this becomes a single-step runbook

UI needs:

- a `Security feed` action per VM
- a future `Rotate Security Updates` button
- summary output that highlights reboot-required machines and kernel/core package changes

## Recommended Backend Changes

### A. Safety metadata

Needed:

- critical infrastructure flag surfaced to the UI and plugin consumers

Current Phase 1 status:

- `FG-VM` is now treated as critical infrastructure in policy logic

### B. Runbook registry

Recommended:

- add a backend runbook registry with definitions such as:
  - id
  - name
  - description
  - safety notes
  - step definitions

Suggested route surface:

- `GET /api/runbooks`
- `GET /api/runbooks/:id`
- `POST /api/runbooks/:id/execute`

### C. Runbook execution

Recommended model:

- create a dedicated runbook execution job type
- log each step to job logs
- allow the UI and OpenClaw to inspect progress through existing job detail views

Suggested future job types:

- `RUNBOOK_PREPARE_VPN_LAB`
- `RUNBOOK_BRING_UP_BLUE_TEAM`
- `RUNBOOK_ROTATE_SECURITY_UPDATES`

Alternative first implementation:

- plugin-level orchestration that calls existing PCM tools

Tradeoff:

- faster to ship
- weaker audit trail than a backend-native runbook job

Preferred long-term answer:

- backend-native runbook jobs

## Recommended Plugin Changes

OpenClaw should not infer these runbooks ad hoc every time. It should have explicit runbook tools.

Suggested tools:

- `pcm_fire_lab`
- `pcm_stop_lab`
- `pcm_get_update_feed`
- future: `pcm_rotate_security_updates`

Plugin behavior should:

- return step-by-step progress summaries
- stay grounded in actual PCM job results
- call out when `FG-VM` was required to restore lab connectivity

## Recommended OpenClaw Workspace Rules

The OpenClaw workspace files should reinforce:

- `FG-VM` is critical infrastructure
- runbooks must prefer safety over speed
- no tool result should be exaggerated
- background autonomy should stay lightweight

## Recommended UI/UX Changes

### Runbooks panel

Add a dedicated panel to the frontend with:

- runbook cards
- safety note badges
- last run status
- recent run summary

Suggested buttons:

- `Prepare VPN Lab`
- `Bring Up Blue Team`
- `Rotate Security Updates`
- `Fire Blue Team Lab`
- `Fire Red Team Lab`
- `Fire Purple Team Lab`
- `Fire WG-VPN`

### Critical infrastructure presentation

The UI should visibly mark `FG-VM` and any future critical nodes.

Desired treatment:

- `Critical infrastructure` badge
- routine stop action guarded
- explanatory note in the card
- explicit checkbox on lab-stop flows for including the gateway

### Runbook result UX

When runbooks execute:

- show a progress card or job view
- display each step clearly
- summarize:
  - started VMs
  - failed steps
  - SSH-ready nodes
  - reboot-required nodes

## Documentation Changes

When implementation starts landing, update:

- root `README.md`
- `docs/PROJECT_WRITEUP.md`
- `backend/README.md`
- `frontend/README.md`
- `openclaw-plugin-private-cloud-manager/README.md`

These docs should explain:

- why runbooks are useful on modest local hardware
- why backend-controlled execution is safer than free-form shell AI
- why `FG-VM` is treated specially
- why security-only rotations should be paired with a changelog feed instead of blind full upgrades

## Suggested Implementation Order

1. Critical infrastructure policy and UI surfacing
2. Frontend lab preset panel
3. Plugin lab preset tools
4. Backend runbook registry
5. Backend-native runbook execution jobs
6. Richer run history and summaries

## Success Criteria

Phase 1 is successful when Malek can say:

- `fire the blue team lab`
- `fire the red team lab`
- `fire the purple team lab`
- `fire the WG-VPN lab`

and OpenClaw can respond through explicit PCM lab tools instead of free-form guessing.
