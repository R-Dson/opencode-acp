# Managed Settings Guide

This document provides an internal guide for understanding and utilizing the managed settings functionality within the OpenCode Agent project. Managed settings allow for centralized control over certain agent behaviors, permissions, and configurations, particularly useful in enterprise or managed environments.

## Overview

The `src/utils/settings-utils.ts` file implements the logic for loading and applying managed settings. These settings can be defined in `managed-settings.json` files located at:

- **System-wide (higher precedence):**
  - macOS: `/Library/Application Support/OpenCode/managed-settings.json`
  - Linux/WSL: `/etc/opencode/managed-settings.json`
  - Windows: `C:\ProgramData\OpenCode\managed-settings.json`
- **User-level (lower precedence):**
  - All OS: `~/.opencode/managed-settings.json` (where `~` is the user's home directory)

The system-wide settings take precedence over user-level settings.

## `managed-settings.json` Structure

The `managed-settings.json` file is a JSON object that can contain the following top-level properties:

```json
{
  "permissions": {
    "allow": ["command_pattern_1", "command_pattern_2"],
    "deny": ["command_pattern_3"]
  },
  "env": {
    "MY_ENV_VAR": "value",
    "ANOTHER_VAR": "another_value"
  },
  "models": {
    "default": "provider/model-id",
    "allowed": ["provider/model-id-1", "provider/model-id-2"]
  }
}
```

### Properties:

- **`permissions` (optional):**
  - **`allow` (string[]):** An array of command patterns that are explicitly allowed. Commands matching these patterns will bypass permission prompts.
  - **`deny` (string[]):** An array of command patterns that are explicitly denied. Commands matching these patterns will not be executed.
  - _Note:_ The specific handling of permissions (e.g., `bash`, `edit`, `webfetch`) is managed by `TaskOrchestrator` and `OpenCodeAdapter` based on the loaded settings.
- **`env` (object):** A key-value pair object where keys are environment variable names and values are their corresponding string values. These environment variables will be set in the agent's process environment.
- **`models` (object):**
  - **`default` (string):** Specifies a default model to be used by the agent (e.g., "anthropic/claude-3-5-sonnet-20241022"). This overrides any default model set via other configurations.
  - **`allowed` (string[]):** An array of model identifiers (e.g., "provider/model-id") that are explicitly allowed for use by the agent. If this list is present, only models in this list can be used; otherwise, all models are allowed.

## How Managed Settings are Applied

1.  **Loading:** When the agent starts (`src/index.ts`), `loadManagedSettings()` from `src/utils/settings-utils.ts` attempts to read the `managed-settings.json` file from the system-wide path first, then the user-level path.
2.  **Environment Variables:** If the `env` property is present in the loaded settings, `applyEnvironmentSettings()` sets these environment variables in the current process.
3.  **Model Configuration:** The `getDefaultModelFromSettings()` and `isModelAllowed()` functions can be used by other parts of the application (e.g., `OpenCodeAdapter` for model selection) to enforce the configured default and allowed models.
4.  **Permissions:** The `permissions` object can be consumed by components that manage tool execution (e.g., `OpenCodeAdapter.requestToolPermission`) to determine whether an operation should be allowed, denied, or prompt for user approval.

## Usage and Testing (Internal Development)

To test the managed settings functionality during development:

1.  **Create a `managed-settings.json` file:** Place it in either the system-wide or user-level directory (e.g., `~/.opencode/managed-settings.json` for convenience during development).
2.  **Populate the file:** Add the desired `permissions`, `env`, and `models` configurations.
3.  **Run the agent:** Start the agent (e.g., `node dist/index.js --tcp`) and observe its behavior.
    - Check environment variables (`process.env.MY_ENV_VAR`).
    - Verify if model selection respects `default` and `allowed` settings.
    - Test tool execution to see if `bash` or `file` operations are affected by `permissions` settings.

This internal guide should help developers understand and leverage the managed settings feature for various deployment scenarios.
