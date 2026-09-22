import { bootShell } from '../../src/shell/boot.ts';
import { GAME } from './game.config.ts';
import { createMechanicHost } from './mechanic/index.ts';
import './mechanic/two-moves-later.css';

void bootShell(GAME, createMechanicHost());
