---
name: soc-incident-investigation
description: "Use when you need a structured SOC incident investigation workflow, triage guidance, root cause analysis, containment planning, and reporting for security operations."
---

# SOC Incident Investigation Skill

## Purpose
Support security operations and incident response workflows by guiding SOC analysts through structured investigation, triage, containment, remediation, and reporting.

## When to Use
- triaging security alerts and suspicious activity
- investigating cloud, hybrid, or infrastructure incidents
- building incident timelines and evidence summaries
- recommending containment, remediation, and escalation actions
- translating findings into SOC playbooks, threat hunting hypotheses, and executive reports

## SOC Investigation Workflow
1. Clarify context and scope
   - identify alert source, affected assets, users, and data
   - collect relevant logs, alerts, timeline data, and system state
   - determine business impact, threat vectors, and attacker objectives
2. Triage and classify
   - distinguish false positives from true incidents
   - assign severity, confidence, and incident category
   - identify impacted security domains: identity, network, endpoint, cloud
3. Analyze root cause and attack chain
   - inspect evidence across logs, network flows, identity events, and host telemetry
   - map activity to MITRE ATT&CK, kill chain stages, and SOC telemetry gaps
   - identify initial access, persistence, lateral movement, and exfiltration vectors
4. Contain and remediate
   - recommend containment actions such as isolation, credential rotation, block rules, or session termination
   - preserve forensic evidence and document chain of custody
   - propose remediation steps to remove artifacts and restore systems safely
5. Document and report
   - summarize findings, impact, and uncertainties clearly
   - provide a concise incident timeline and next-step recommendations
   - suggest follow-up hunting, detection tuning, and process improvements

## Quality Criteria
- base conclusions on evidence and observable telemetry
- keep recommendations concrete, safe, and operations-aware
- surface uncertainty and identify missing data when needed
- align guidance with SOC roles, escalation, and compliance needs

## Recommended Outputs
- incident summary
- triage checklist
- containment and remediation plan
- executive briefing or post-incident report
- detection tuning recommendations
- follow-up threat hunting hypothesis
