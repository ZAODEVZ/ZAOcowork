// Filesystem layout under $COWORK_HOME (defaults to ~/.zaocoworking/).
// Mirrors ZOE's ~/.zao/zoe/ pattern per doc 662 B.1.

import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = process.env.COWORK_HOME ?? join(homedir(), '.zaocoworking');

export const COWORK_PATHS = {
  home: HOME,
  persona: join(HOME, 'persona.md'),
  human: join(HOME, 'human.md'),
  tasks: join(HOME, 'tasks.json'),
  actionsCache: join(HOME, 'actions.json'),
  actionsSha: join(HOME, 'actions-sha.txt'),
  recent: join(HOME, 'recent'),
  archive: join(HOME, 'archive'),
  sentinels: join(HOME, 'sentinels'),
  pending: join(HOME, 'pending-suggestion.json'),
} as const;
