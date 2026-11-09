// Owner: Rahul (B) — task B4. Spec: Notion guide, Phase 5 "src/instrumentation.ts".
// Next.js calls register() once per server start. Telemetry stays off (and the app still
// works) until OTEL_EXPORTER_OTLP_ENDPOINT is set; the SDK only loads in the Node.js runtime.
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ) {
    await import("./instrumentation.node");
  }
}
