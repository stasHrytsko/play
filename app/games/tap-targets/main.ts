import { bootShell } from '../../src/shell/boot.ts';
import { GAME } from './game.config.ts';
import { createMechanicHost } from './mechanic/index.ts';

void bootShell(GAME, createMechanicHost());
