import { transitionVerificationState, type VerificationEvent, type VerificationState } from './machine.js';

export interface VerificationSession {
  send(event: VerificationEvent): VerificationState;
  state: VerificationState;
}

export const createVerificationSession = (): VerificationSession => ({
  state: 'idle',
  send(event) {
    this.state = transitionVerificationState(this.state, event);
    return this.state;
  },
});

