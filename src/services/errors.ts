export class HttpError extends Error {
  constructor(public status: number, public errors: string[]) {
    super(errors.join('; '));
  }
}
