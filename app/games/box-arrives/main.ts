import { bootShell } from '../../src/shell/boot.ts';
import { GAME } from './game.config.ts';
import { createMechanicHost } from './mechanic/index.ts';
import './mechanic/box-arrives.css';

void bootShell(GAME, createMechanicHost());
