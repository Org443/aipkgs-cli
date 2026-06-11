# agency-agents

The Agency's roster of **232 specialist AI subagents**, imported from
[msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)
(MIT, © AgentLand Contributors).

Each agent is published as a standalone `subagent` package under
`agency-agents/<department>/<slug>`. Each **department** is bundled as a `box`
that pulls in its agents as dependencies — install a whole department in one
command, or cherry-pick a single agent.

## Department boxes

| Box                                | Agents |
| ---------------------------------- | ------ |
| `agency-agents/Academic`           | 5      |
| `agency-agents/Design`             | 9      |
| `agency-agents/Engineering`        | 33     |
| `agency-agents/Finance`            | 5      |
| `agency-agents/Game-Development`   | 20     |
| `agency-agents/Gis`                | 13     |
| `agency-agents/Marketing`          | 36     |
| `agency-agents/Paid-Media`         | 7      |
| `agency-agents/Product`            | 5      |
| `agency-agents/Project-Management` | 7      |
| `agency-agents/Sales`              | 9      |
| `agency-agents/Security`           | 10     |
| `agency-agents/Spatial-Computing`  | 6      |
| `agency-agents/Specialized`        | 53     |
| `agency-agents/Support`            | 6      |
| `agency-agents/Testing`            | 8      |

## Install

```sh
aipkg box agency-agents/Engineering          # a whole department
aipkg box agency-agents/engineering/ai-engineer   # a single agent
```
