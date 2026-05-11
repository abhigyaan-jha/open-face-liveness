export class WebVerifyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WebVerifyError';
    this.code = code;
  }
}

