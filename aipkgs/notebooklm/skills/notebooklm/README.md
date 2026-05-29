# notebooklm

A standalone Claude Code skill that lets Claude query your Google NotebookLM
notebooks directly, returning source-grounded, citation-backed answers from
Gemini. Each question opens a fresh browser session, retrieves an answer
exclusively from your uploaded documents, and closes — drastically reducing
hallucinations.

Includes browser-automation scripts, persistent auth handling, and reference
docs for API usage, troubleshooting, and usage patterns.

## Attribution

Imported from [PleasePrompto/notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill)
by the original author. Licensed under MIT (see `LICENSE.txt`).

## Install

```sh
aipkg install notebooklm/notebooklm
```
