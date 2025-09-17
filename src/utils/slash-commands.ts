import { AvailableCommand } from '@zed-industries/agent-client-protocol';

export const AVAILABLE_SLASH_COMMANDS: AvailableCommand[] = [
  {
    name: 'cycle_mode',
    description: 'Cycle between agent operating modes.',
    input: { hint: 'Use this to cycle between the modes. Default modes are `Edit` and `Plan`.' },
  },
  // Add other slash commands here as they are implemented
];