// SHARED CONTRACT — Engineer A calls these from API routes; Engineer B owns the SDK setup
// (src/instrumentation*.ts). Until the SDK is registered every call here is a no-op.
// Privacy rule: attributes carry lengths, counts, ids and modes only — never attendee
// background, goal, prompt text or generated guides.
import "server-only";
import {
  logs,
  metrics,
  trace,
  SeverityNumber,
  SpanStatusCode,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

const tracer = trace.getTracer("talkbridge-app");
const meter = metrics.getMeter("talkbridge-app");
const logger = logs.getLogger("talkbridge-app");

const operationDuration = meter.createHistogram("talkbridge.operation.duration", {
  unit: "ms",
  description: "Duration of TalkBridge business operations",
});
const operationErrors = meter.createCounter("talkbridge.operation.errors", {
  description: "Failed TalkBridge business operations",
});
export const aiTokens = meter.createCounter("talkbridge.ai.tokens", {
  unit: "{token}",
  description: "OpenAI tokens used for guides",
});
export const searchResults = meter.createHistogram("talkbridge.search.results", {
  description: "Number of sessions returned per search",
});

const SEVERITY = {
  INFO: SeverityNumber.INFO,
  WARN: SeverityNumber.WARN,
  ERROR: SeverityNumber.ERROR,
} as const;

export function log(
  severity: keyof typeof SEVERITY,
  message: string,
  attributes: Attributes = {}
) {
  logger.emit({
    severityNumber: SEVERITY[severity],
    severityText: severity,
    body: message,
    attributes,
  });
  const line = `[${severity}] ${message}`;
  if (severity === "ERROR") console.error(line, attributes);
  else console.log(line, attributes);
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "unknown error";
}

/** Wraps one business operation in a span + duration metric + error counter + error log. */
export async function observe<T>(
  name: string,
  attributes: Attributes,
  work: (span: Span) => Promise<T>
): Promise<T> {
  const started = performance.now();
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    const base = { "talkbridge.operation": name };
    try {
      const result = await work(span);
      span.setStatus({ code: SpanStatusCode.OK });
      operationDuration.record(performance.now() - started, {
        ...base,
        outcome: "success",
      });
      return result;
    } catch (error) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      span.setAttribute("error.type", errorType);
      span.recordException({ name: errorType, message: `${name} failed` });
      span.setStatus({ code: SpanStatusCode.ERROR, message: `${name} failed` });
      operationDuration.record(performance.now() - started, {
        ...base,
        outcome: "error",
      });
      operationErrors.add(1, { ...base, "error.type": errorType });
      log("ERROR", `${name} failed`, {
        ...base,
        "error.type": errorType,
        "error.message": safeMessage(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
