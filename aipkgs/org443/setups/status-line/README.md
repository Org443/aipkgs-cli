# status-line

A terminal status line for Claude Code that displays live session context at a glance — model name, current directory, context window usage, session cost, and API base URL.

![status-line preview](https://aipkgs.com/static/images/status-line.png)

## What it shows

| Field         | Description                                                            |
| ------------- | ---------------------------------------------------------------------- |
| **Model**     | Active Claude model display name                                       |
| **Directory** | Current workspace path                                                 |
| **Context**   | Visual progress bar + percentage of context window used                |
| **Cost**      | Cumulative session cost in USD                                         |
| **API URL**   | `ANTHROPIC_BASE_URL` (useful when proxying or using a custom endpoint) |

## Install

```sh
npx @aipkgs/cli setup org443/status-line
```

This registers a `statusLine` hook that runs automatically after each Claude Code turn, piping session state into the status line script.

## How it works

The setup adds a `statusLine` command to your Claude Code configuration. Claude Code calls the script at the end of each response, passing a JSON payload with model info, workspace path, token usage, and cost. The script renders a single-line summary to stdout, which Claude Code displays in the terminal status bar.

Context window fill is visualized as a 20-character block bar, so you can see at a glance how much headroom remains before the conversation compresses.
