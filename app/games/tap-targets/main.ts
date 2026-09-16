import '../../src/styles/ui-kit.css';
import { bootShell } from '../../src/shell/boot.ts';
import { GAME } from './game.config.ts';
import { createMechanicHost } from './mechanic/index.ts';
import './mechanic/tap-targets.css';

void bootShell(GAME, createMechanicHost());
