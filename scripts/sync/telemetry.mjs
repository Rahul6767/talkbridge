// OpenTelemetry for the sync job (a plain Node process, so src/instrumentation.node.ts
// does not run here). Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set, like the web app.
import { metrics, trace, logs, SeverityNumber, SpanStatusCode } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace";

let sdk;

export function startTelemetry() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": process.env.OTEL_SERVICE_NAME || "talkbridge-sync",
      "service.version": process.env.APP_VERSION || "dev",
      "deployment.environment.name": process.env.DEPLOYMENT_ENVIRONMENT || "development",
    }),
    spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: 60_000,
      }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [],
  });
  sdk.start();
}

/** Flushes and exports everything; call before the process exits. */
export async function stopTelemetry() {
  await sdk?.shutdown();
}

const tracer = () => trace.getTracer("talkbridge-sync");
const meter = () => metrics.getMeter("talkbridge-sync");

export function log(message, attributes = {}) {
  const severity = message.startsWith("ERROR")
    ? SeverityNumber.ERROR
    : message.startsWith("WARN")
      ? SeverityNumber.WARN
      : SeverityNumber.INFO;
  logs.getLogger("talkbridge-sync").emit({ severityNumber: severity, body: message, attributes });
  (severity === SeverityNumber.ERROR ? console.error : console.log)(message);
}

export async function inSpan(name, attributes, work) {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await work(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error?.message ?? error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function recordCounts(source, counts, durationMs, ok) {
  const documents = meter().createCounter("talkbridge.sync.documents", {
    description: "Sessions processed by the sync job, by action",
  });
  for (const action of ["added", "updated", "unchanged", "deleted", "rejected", "failed"]) {
    if (counts[action]) documents.add(counts[action], { "talkbridge.sync.source": source, action });
  }
  meter()
    .createHistogram("talkbridge.sync.duration", { unit: "ms" })
    .record(durationMs, { "talkbridge.sync.source": source, outcome: ok ? "success" : "error" });
  if (ok) {
    // Dash0 alert/SLO: data is stale if this is older than ~7h (schedule is every 6h).
    meter()
      .createGauge("talkbridge.sync.last_success", { unit: "s" })
      .record(Math.floor(Date.now() / 1000), { "talkbridge.sync.source": source });
  }
}
