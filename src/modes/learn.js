// STUB — Phase 3 worker replaces with the real Learn mode (quiz + spaced repetition). See CONTRACTS.md Phase 3.
import { explain, setSidePanel } from '../ui/panels.js';
export const LearnMode = {
  id: 'learn', label: 'Learn', accent: 0x7ed69a,
  enter(app) { setSidePanel('<div class="panel-title">Learn</div><div class="panel-sub">Stub.</div>'); explain({ title: 'Learn (stub)', html: '<p>Quiz yourself on what you just explored.</p>' }); },
  exit(app) {}, update() {}, onPick() {}, onHover() {},
};
