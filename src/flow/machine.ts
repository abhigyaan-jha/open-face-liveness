export type VerificationState =
  | 'idle'
  | 'loading'
  | 'acquiring-face'
  | 'challenging'
  | 'completed'
  | 'failed';

export type VerificationEvent =
  | { type: 'LOAD' }
  | { type: 'FACE_READY' }
  | { type: 'COMPLETE' }
  | { type: 'FAIL' }
  | { type: 'RESET' };

export const transitionVerificationState = (
  state: VerificationState,
  event: VerificationEvent,
): VerificationState => {
  if (event.type === 'RESET') return 'idle';
  if (event.type === 'FAIL') return 'failed';
  if (state === 'idle' && event.type === 'LOAD') return 'loading';
  if (state === 'loading' && event.type === 'FACE_READY') return 'challenging';
  if (state === 'challenging' && event.type === 'COMPLETE') return 'completed';
  return state;
};

