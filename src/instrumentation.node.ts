// Owner: Rahul (B) — task B4. Spec: Notion guide, Phase 5 "src/instrumentation.node.ts".
// One OpenTelemetry Node SDK exports traces, metrics and logs over OTLP/HTTP (protobuf).
// The exporters read OTEL_EXPORTER_OTLP_ENDPOINT / _HEADERS and append /v1/traces etc.
import type { Context } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace";

// Privacy: URLs can carry user text (e.g. /api/search?q=...). Next.js's own request span
// records `http.target: req.url` and the HTTP instrumentation records `url.query`, so we
// drop query strings from every span as it starts (attributes are still writable here).
const URL_ATTRIBUTES = ["http.target", "http.url", "url.full"];

class RedactUrlQueryProcessor implements SpanProcessor {
  onStart(span: Span, _parentContext: Context): void {
    void _parentContext;
    for (const key of URL_ATTRIBUTES) {
      const value = span.attributes[key];
      if (typeof value === "string" && value.includes("?")) {
        span.setAttribute(key, value.slice(0, value.indexOf("?")));
      }
    }
    if (span.attributes["url.query"] !== undefined) {
      span.setAttribute("url.query", "[redacted]");
    }
  }
  onEnd(_span: ReadableSpan): void {
    void _span;
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": process.env.OTEL_SERVICE_NAME || "talkbridge",
    "service.version": process.env.APP_VERSION || "dev",
    "deployment.environment.name":
      process.env.DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || "development",
  }),
  // Order matters: redact first, then batch-export. (spanProcessors replaces traceExporter.)
  spanProcessors: [
    new RedactUrlQueryProcessor(),
    new BatchSpanProcessor({ exporter: new OTLPTraceExporter() }),
  ],
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15_000,
    }),
  ],
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
  instrumentations: [
    getNodeAutoInstrumentations({
      // Noisy, low-value spans for this app.
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-net": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      // Never record prompts or generated guides (it is off by default; we make it explicit).
      "@opentelemetry/instrumentation-openai": { captureMessageContent: false },
    }),
  ],
});

sdk.start();

// Flush buffered telemetry when Kubernetes stops the pod.
process.once("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});
