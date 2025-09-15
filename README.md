# opencode-acp

## Overview

Opencode with Agent Client Protocol (ACP), to be used with Zed Editor.

**Note:** This project is a for testing and a small attempt at implementing Opencode with ACP to demonstrate core functionalities.

## Getting Started

```bash
# Install dependencies
npm install

# Build
npm run build
```

## Adding as an Agent Server

To add this agent as a server in your environment, include the following configuration:

```json
{
  "agent_servers": {
      "Opencode Agent": {
        "command": "npx",
        "args": [
          "tsx",
          "path/to/src/index.ts"
        ]
      }
    }
}
```

It will use the model that is set to default in opencode, use the TUI to change it.
