import { readFileSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Interface for managed settings structure
 */
interface ManagedSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  env?: Record<string, string>;
  models?: {
    default?: string;
    allowed?: string[];
  };
}

/**
 * Get the path to the managed settings file based on OS
 * Following similar pattern to Claude Code's managed settings
 * @returns Path to managed settings file
 */
function getManagedSettingsPath(): string {
  const os = platform();
  switch (os) {
    case 'darwin':
      return '/Library/Application Support/OpenCode/managed-settings.json';
    case 'linux': // including WSL
      return '/etc/opencode/managed-settings.json';
    case 'win32':
      return 'C:\\ProgramData\\OpenCode\\managed-settings.json';
    default:
      return '/etc/opencode/managed-settings.json';
  }
}

/**
 * Load managed settings from system-wide configuration files
 * This is useful for enterprise environments where settings need to be centrally managed
 * @returns ManagedSettings object or null if not found
 */
export function loadManagedSettings(): ManagedSettings | null {
  try {
    // Try system-wide managed settings first
    const systemSettingsPath = getManagedSettingsPath();
    const systemSettings = JSON.parse(readFileSync(systemSettingsPath, 'utf8')) as ManagedSettings;
    return systemSettings;
  } catch (systemError) {
    // If no system settings, try user-level settings
    try {
      const userSettingsPath = join(homedir(), '.opencode', 'managed-settings.json');
      const userSettings = JSON.parse(readFileSync(userSettingsPath, 'utf8')) as ManagedSettings;
      return userSettings;
    } catch (userError) {
      // No managed settings found
      return null;
    }
  }
}

/**
 * Apply environment settings from managed settings
 * @param settings ManagedSettings object
 */
export function applyEnvironmentSettings(settings: ManagedSettings): void {
  if (settings.env) {
    for (const [key, value] of Object.entries(settings.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * Get default model from managed settings
 * @param settings ManagedSettings object
 * @returns Default model string or null
 */
export function getDefaultModelFromSettings(settings: ManagedSettings): string | null {
  if (settings.models?.default) {
    return settings.models.default;
  }
  return null;
}

/**
 * Check if a model is allowed in managed settings
 * @param settings ManagedSettings object
 * @param model Model identifier
 * @returns Boolean indicating if model is allowed
 */
export function isModelAllowed(settings: ManagedSettings, model: string): boolean {
  if (!settings.models?.allowed) {
    // If no allowed models specified, all models are allowed
    return true;
  }
  return settings.models.allowed.includes(model);
}
