#!/usr/bin/env bash
# Sample requests against the AIpkgs registry list endpoint.
# Always URL-encode the `search` value when running for real.

API="https://api.aipkgs.com"

# 1) Broad text search across name, slug, description, and tags.
curl -s "$API/v1/packages?search=pr"

# 2) Filter by type to narrow to slash commands only.
curl -s "$API/v1/packages?search=pr&type=cmd"

# 3) List everything published by a specific org.
curl -s "$API/v1/packages?org=org443&limit=50"

# 4) Browse all skills with no text filter (newest popular first).
curl -s "$API/v1/packages?type=skill&limit=25"

# 5) Page forward using a cursor returned from a previous call.
curl -s "$API/v1/packages?search=review&cursor=eyJsYXN0VmFsdWVzIjpbMTIsNDIsImEtdXVpZCJdLCJvcmRlckJ5IjpbWyJ0b3RhbF9kb3dubG9hZHMiLCJkZXNjIl1dLCJsaW1pdCI6MjV9"

# 6) Fetch the manifest for a specific package + version.
curl -s "$API/v1/packages/cmd/org443/pr-create/0.2.1/aipkg.json"
