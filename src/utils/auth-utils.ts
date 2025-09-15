import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Checks if the user is authenticated with OpenCode by checking for auth.json
 * @returns True if authenticated, false otherwise
 */
export function isOpenCodeAuthenticated(): boolean {
  try {
    const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
    return fs.existsSync(authPath);
  } catch (error: any) {
    return false;
  }
}

/**
 * Gets the authentication methods for OpenCode
 * @returns Array of authentication methods
 */
export function getOpenCodeAuthMethods() {
  return [
    {
      description: 'Run `opencode auth login` in the terminal',
      name: 'Log in with OpenCode',
      id: 'opencode-login',
    },
  ];
}
