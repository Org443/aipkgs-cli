#!/bin/bash
# Read JSON input once
input=$(cat)

# Debug: uncomment to see the full JSON structure
# echo "$input" | jq '.' > /tmp/status-line-debug.json

# Helper functions for common extractions
get_model_name() { echo "$input" | jq -r '.model.display_name'; }
get_current_dir() { echo "$input" | jq -r '.workspace.current_dir'; }
get_project_dir() { echo "$input" | jq -r '.workspace.project_dir'; }
get_version() { echo "$input" | jq -r '.version'; }
get_cost() { echo "$input" | jq -r '.cost.total_cost_usd'; }
get_duration() { echo "$input" | jq -r '.cost.total_duration_ms'; }
get_lines_added() { echo "$input" | jq -r '.cost.total_lines_added'; }
get_lines_removed() { echo "$input" | jq -r '.cost.total_lines_removed'; }
get_token_budget() { echo "$input" | jq -r '.context_window.context_window_size'; }
get_current_usage() { echo "$input" | jq -r '.context_window.current_usage | .input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens'; }

# Use the helpers
MODEL=$(get_model_name)
DIR=$(get_current_dir)
COST=$(printf "%.2f" "$(get_cost)")
TOKENS=$(get_current_usage)
BUDGET=$(get_token_budget)

# Format token usage with progress bar
if [ "$BUDGET" != "null" ] && [ "$BUDGET" != "0" ]; then
  TOKEN_PCT=$(awk "BEGIN {printf \"%.1f\", ($TOKENS / $BUDGET) * 100}")

  # Create progress bar (20 characters wide)
  FILLED=$(awk "BEGIN {printf \"%.0f\", ($TOKENS / $BUDGET) * 20}")
  BAR=""
  for ((i=0; i<20; i++)); do
    if [ $i -lt $FILLED ]; then
      BAR="${BAR}█"
    else
      BAR="${BAR}░"
    fi
  done

  TOKEN_INFO="[${BAR}] ${TOKEN_PCT}%"
else
  TOKEN_INFO="${TOKENS}"
fi

BASE_URL="${ANTHROPIC_BASE_URL:-https://api.anthropic.com}"
echo "$MODEL | $DIR | Context: $TOKEN_INFO | Cost: \$$COST | $BASE_URL"