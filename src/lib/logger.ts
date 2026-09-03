type LogLevel = 'info' | 'warn' | 'error';

function sanitizeError(err: unknown): string | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return String(err);
}

function sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
  if (!context) return undefined;

  const safeContext: Record<string, any> = {};
  for (const [key, value] of Object.entries(context)) {
    // Sanitize raw objects to prevent leaking secrets (like TG_SESSION or API keys)
    if (key === 'entity' || key === 'message' || key === 'err' || key === 'error') {
      safeContext[key] = '[REDACTED]';
    } else {
      safeContext[key] = value;
    }
  }
  return safeContext;
}

function writeLog(level: LogLevel, event: string, context?: Record<string, any>, error?: unknown) {
  const output: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level,
    event,
  };

  const safeContext = sanitizeContext(context);
  if (safeContext && Object.keys(safeContext).length > 0) {
    output.context = safeContext;
  }

  const safeError = sanitizeError(error);
  if (safeError) {
    output.error = safeError;
  }

  const jsonString = JSON.stringify(output, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value
  );
  if (level === 'error') {
    console.error(jsonString);
  } else if (level === 'warn') {
    console.warn(jsonString);
  } else {
    console.log(jsonString);
  }
}

export const logger = {
  info: (event: string, context?: Record<string, any>) => writeLog('info', event, context),
  warn: (event: string, context?: Record<string, any>, error?: unknown) => writeLog('warn', event, context, error),
  error: (event: string, context?: Record<string, any>, error?: unknown) => writeLog('error', event, context, error),
};
