const PREFIX = 'bulk-decaffeinate CLIError: ';

/**
 * Exception class for a nice-looking error.
 *
 * Apparently async/await propagation doesn't preserve the exception, so to work
 * around this, we put a special prefix at the start of CLI errors and format
 * the error without a stack trace if the message starts with that prefix.
 */
export default class CLIError extends Error {
  constructor(message) {
    super(PREFIX + message);
  }

  static formatError(e) {
    if (e.message.startsWith(PREFIX)) {
      return e.message.substring(PREFIX.length);
    } else {
      return e;
    }
  }
}
