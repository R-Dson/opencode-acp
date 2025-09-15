# ACP Client Connection Implementations Overview

This document provides an internal architectural overview of the `ACPClientConnection` interface and its concrete implementations within the OpenCode Agent project.

## 1. `ACPClientConnection` Interface (`src/types.ts`)

The `ACPClientConnection` interface defines the contract for how the OpenCode Agent interacts with the client (e.g., a VS Code extension, a terminal). It abstracts various communication capabilities required by the Agent Client Protocol (ACP), including:

- **File System Operations:** `readTextFile`, `writeTextFile`
- **Permission Requests:** `requestPermission`
- **Session Updates:** `sessionUpdate` (for sending notifications back to the client)
- **Terminal Operations:** `createTerminal`, `terminalOutput`, `killTerminalCommand`, `releaseTerminal`, `waitForTerminalExit`

This interface allows the `TaskOrchestrator` and other core components to remain decoupled from the underlying communication mechanism.

## 2. TCP Implementation: `ACPServer` (`src/agent/acp-server.ts`)

The `ACPServer` class provides a TCP-based implementation of the `ACPClientConnection` interface. It uses `express` to set up an HTTP server that listens for incoming ACP requests.

- **Role:** Acts as a server endpoint for ACP communication, primarily used when the OpenCode Agent is run in `--tcp` mode.
- **Mechanism:** Exposes a `/acp` POST endpoint where ACP messages (JSON-RPC 2.0 format) are received.
- **Delegation:** It parses incoming messages using `ProtocolHandler` and delegates the processing to the `TaskOrchestrator` based on the message method (e.g., `initialize`, `session/new`, `session/prompt`).
- **`ACPClientConnection` Methods:** When methods like `readTextFile` or `sessionUpdate` are called by the `TaskOrchestrator` (or other components), `ACPServer` is responsible for sending these requests back to the connected ACP client over the established TCP connection. (Note: Current implementation of `ACPClientConnection` methods in `ACPServer` are placeholders and would need actual HTTP client logic to send requests back to the client.)

## 3. Standard I/O (stdio) Implementation: `StdioACPClientConnection` (`src/agent/stdio-acp-client-connection.ts`)

The `StdioACPClientConnection` class provides a standard I/O (stdin/stdout) based implementation of the `ACPClientConnection` interface. It is used when the OpenCode Agent is run without the `--tcp` flag.

- **Role:** Facilitates ACP communication over the process's standard input and output streams. This is common for CLI-based tools or when integrating with environments that communicate via stdio (e.g., some IDE extensions).
- **Mechanism:** It uses `node:stream` and `TransformStream` to preprocess incoming messages from `process.stdin` (converting simplified formats to JSON-RPC) and sends responses/notifications via `process.stdout`.
- **`AgentSideConnection`:** It leverages the `@zed-industries/agent-client-protocol`'s `AgentSideConnection` to manage the ACP handshake and message flow over stdio.
- **`ACPClientConnection` Methods:** When methods defined by `ACPClientConnection` are called (e.g., `readTextFile`, `sessionUpdate`), `StdioACPClientConnection` handles sending these requests/notifications to the client by writing appropriate JSON-RPC messages to `process.stdout`.

## Key Considerations:

- **Message Flow:** Understand the bidirectional nature of communication:
  - Client -> Agent (via `ACPServer` or `StdioACPClientConnection`'s input processing)
  - Agent -> Client (via `ACPClientConnection` methods implemented by `ACPServer` or `StdioACPClientConnection`)
- **Placeholder Implementations:** Note that some `ACPClientConnection` methods in both `ACPServer` and `StdioACPClientConnection` are currently placeholders (e.g., returning empty responses or logging). A complete implementation would involve actual logic to interact with the external client.
- **Error Handling:** Ensure robust error handling for communication failures, malformed messages, and protocol violations in both implementations.
- **Scalability:** For high-throughput scenarios, consider the overhead of HTTP (TCP) vs. direct stream (stdio) communication.
- **Security:** Implement appropriate security measures (e.g., authentication, authorization) for TCP connections if exposed externally.
