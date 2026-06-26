export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.OTEL_SDK_DISABLED === "true") return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    console.warn("[OTel] OTEL_EXPORTER_OTLP_ENDPOINT not set — skipping.");
    return;
  }

  const authHeaders = parseAuthHeaders();
  if (!authHeaders.Authorization) {
    console.warn("[OTel] Set OTEL_EXPORTER_OTLP_HEADERS or OTEL_API_KEY — skipping.");
    return;
  }

  const base = endpoint.replace(/\/$/, "");
  const serviceName = process.env.OTEL_SERVICE_NAME || "vercel-app";
  const deploymentEnv =
    process.env.OTEL_DEPLOYMENT_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    "production";

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = await import(
    "@opentelemetry/exporter-trace-otlp-http"
  );
  const { OTLPMetricExporter } = await import(
    "@opentelemetry/exporter-metrics-otlp-http"
  );
  const { OTLPLogExporter } = await import(
    "@opentelemetry/exporter-logs-otlp-http"
  );
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
    ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  } = await import("@opentelemetry/semantic-conventions");
  const { getNodeAutoInstrumentations } = await import(
    "@opentelemetry/auto-instrumentations-node"
  );
  const { PeriodicExportingMetricReader } = await import(
    "@opentelemetry/sdk-metrics"
  );
  const { LoggerProvider, SimpleLogRecordProcessor } = await import(
    "@opentelemetry/sdk-logs"
  );
  const { SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
  const { logs } = await import("@opentelemetry/api-logs");
  const { metrics, trace } = await import("@opentelemetry/api");

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION || "1.0.0",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: deploymentEnv,
    "elastic.cloud.deployment": "otel-demo-a5630c",
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${base}/v1/traces`,
    headers: authHeaders,
  });
  const metricExporter = new OTLPMetricExporter({
    url: `${base}/v1/metrics`,
    headers: authHeaders,
  });
  const logExporter = new OTLPLogExporter({
    url: `${base}/v1/logs`,
    headers: authHeaders,
  });

  const meterProvider = new (await import("@opentelemetry/sdk-metrics")).MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 15_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  const loggerProvider = new LoggerProvider({ resource });
  loggerProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(logExporter),
  );
  logs.setGlobalLoggerProvider(loggerProvider);

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [new SimpleSpanProcessor(traceExporter)],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();

  const tracer = trace.getTracer(serviceName);
  tracer.startSpan("vercel.startup").end();
  logs.getLogger(serviceName).emit({
    severityText: "INFO",
    body: `[${serviceName}] OTel started on Vercel (${deploymentEnv})`,
  });
}

function parseAuthHeaders(): Record<string, string> {
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS?.trim();
  if (raw) {
    const out: Record<string, string> = {};
    for (const part of raw.split(",")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      out[part.slice(0, eq).trim()] = decodeURIComponent(
        part.slice(eq + 1).trim(),
      );
    }
    if (out.Authorization) return out;
  }
  const key = process.env.OTEL_API_KEY?.trim();
  if (key) return { Authorization: `ApiKey ${key}` };
  return {};
}
