import { TaskOrchestrator } from './agent/task-orchestrator.js';
import { OpenCodeAdapter } from './opencode/opencode-adapter.js';
import { ArtifactManager } from './opencode/artifact-manager.js';
import { ProtocolHandler } from './agent/protocol-handler.js';
import { Logger } from './utils/logger.js';
import { ACPAgent } from './agent/acp-agent.js'; // Import ACPAgent
import { AgentSideConnection } from '@zed-industries/agent-client-protocol';
import { ACPClientConnection } from './types.js';
import { StdioACPClientConnection } from './agent/stdio-acp-client-connection.js';
import { loadManagedSettings, applyEnvironmentSettings } from './utils/settings-utils.js'; // Import settings utilities
import { Readable, Writable } from 'node:stream';
import { createPreprocessedInputStream } from './utils/streams.js';

// Load managed settings and apply environment variables
const managedSettings = loadManagedSettings();
if (managedSettings) {
  applyEnvironmentSettings(managedSettings);
}

const logger = new Logger();

logger.info('Starting ACP Server in stdio mode.');

const protocolHandler = new ProtocolHandler(logger);

// Initialize OpenCodeAdapter with placeholders
const opencodeAdapter = new OpenCodeAdapter(logger, null as any, null as any);

// Initialize ArtifactManager
const artifactManager = new ArtifactManager(opencodeAdapter, logger);

// Initialize TaskOrchestrator with placeholders
const taskOrchestrator = new TaskOrchestrator(
  opencodeAdapter,
  artifactManager,
  protocolHandler,
  null as any,
  logger,
);

// Initialize ACPAgent
const acpAgent = new ACPAgent(taskOrchestrator, logger);

// --- Setup AgentSideConnection and resolve circular dependencies ---

// Create preprocessed streams (logic moved to src/utils/streams.ts)
const outputStream = Writable.toWeb(process.stdout) as WritableStream;

const preprocessedInputStream = createPreprocessedInputStream(protocolHandler, logger);

// Create AgentSideConnection, which will provide the ACPClientConnection
const agentSideConnection = new AgentSideConnection(
  (conn) => {
    // 'conn' here is AgentSideConnection
    logger.info('index.ts: AgentSideConnection factory called');
    const acpClientConn = conn as unknown as ACPClientConnection; // Cast to ACPClientConnection
    // Set the clientConnection on opencodeAdapter and taskOrchestrator
    (opencodeAdapter as any).clientConnection = acpClientConn;
    (taskOrchestrator as any).clientConnection = acpClientConn;
    // Also set the taskOrchestrator on opencodeAdapter (circular dependency)
    (opencodeAdapter as any).taskOrchestrator = taskOrchestrator;
    return acpAgent;
  },
  outputStream,
  preprocessedInputStream,
);
