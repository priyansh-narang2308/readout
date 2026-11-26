# Flagsmith CLI & API Cheat Sheet for Agents

A token-efficient reference for interacting with Flagsmith via CLI (v2) or Edge REST API.

---

## 1. Flagsmith CLI (v2)

### Initialization & Context
```bash
# Bind directory to project and environment (generates flagsmith.json)
flagsmith init

# Check current environment
flagsmith environment get --json
```

### Flag Management
```bash
# List all flags in environment (compact JSON)
flagsmith flag list --json | jq '.[].name'

# Get single feature state
flagsmith flag get <feature_name> --json

# Enable or disable a feature
flagsmith flag enable <feature_name>
flagsmith flag disable <feature_name>

# Update flag value
flagsmith flag update <feature_name> --value "true"
```

### Identity & Experiment Evaluation
```bash
# Evaluate flags for a specific identity (mimics SDK behavior)
flagsmith evaluate --identity <user_id> --json

# Generate local evaluation snapshot
flagsmith eval --js > flags.json
```

---

## 2. Direct Edge API (When CLI is Not Installed)

### Identity Evaluation (GET)
```bash
curl -s -H "X-Environment-Key: $FLAGSMITH_ENV_KEY" \
  "https://edge.api.flagsmith.com/api/v1/identities/?identifier=<user_id>"
```

### Event Ingestion (POST)
```bash
curl -s -X POST -H "X-Environment-Key: $FLAGSMITH_ENV_KEY" \
  -H "Content-Type: application/json" \
  -d '{"events":[{"type":"readout_score","identifier":"<user_id>","value":1}]}' \
  "https://events.api.flagsmith.com/v1/events"
```
*(Returns HTTP 202 Accepted on success)*
