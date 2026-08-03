/** Raised when Telegram asks us to wait before sending again. */
export class FloodWaitSignal extends Error {
  constructor(public readonly seconds: number) {
    super(`FLOOD_WAIT_${seconds}`);
    this.name = 'FloodWaitSignal';
  }
}

/** Raised when the stored session is no longer usable and the user must reconnect. */
export class SessionInvalidSignal extends Error {
  constructor(public readonly reason: string) {
    super(`SESSION_INVALID:${reason}`);
    this.name = 'SessionInvalidSignal';
  }
}

/** Raised when 2FA password is required to finish login. */
export class PasswordNeededSignal extends Error {
  constructor() {
    super('SESSION_PASSWORD_NEEDED');
    this.name = 'PasswordNeededSignal';
  }
}

export const SESSION_INVALID_CODES = [
  'AUTH_KEY_UNREGISTERED',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'USER_DEACTIVATED',
  'AUTH_KEY_DUPLICATED',
];
