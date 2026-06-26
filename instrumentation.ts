export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.OTEL_SDK_DISABLED === "true") return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const apiKey =
    process.env.OTEL_API_KEY?.trim() ||
    process.env.ELASTIC_OTLP_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    console.warn(
      "[OTel] Missing OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_API_KEY — skipping.",
    );
    return;
  }

  const base = endpoint.replace(/\/$/, "");
  const authHeaders = { Authorization: `ApiKey ${apiKey}` };
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
  const { Resource } = await import("@opentelemetry/resources");
  const {
    SEMRESATTRS_SERVICE_NAME,
    SEMRESATTRS_SERVICE_VERSION,
    SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  } = await import("@opentelemetry/semantic-conventions");
  const { getNodeAutoInstrumentations } = await import(
    "@opentelemetry/auto-instrumentations-node"
  );
  const { MeterProvider, PeriodicExportingMetricReader } = await import(
    "@opentelemetry/sdk-metrics"
  );
  const { LoggerProvider, SimpleLogRecordProcessor } = await import(
    "@opentelemetry/sdk-logs"
  );
  const { SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-node");
  const { logs } = await import("@opentelemetry/api-logs");
  const { metrics, trace } = await import("@opentelemetry/api");

  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]:
      process.env.OTEL_SERVICE_VERSION || "1.0.0",
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: deploymentEnv,
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

  const meterProvider = new MeterProvider({
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

  trace.getTracer(serviceName).startSpan("vercel.startup").end();
  logs.getLogger(serviceName).emit({
    severityText: "INFO",
    body: `[${serviceName}] OTel started on Vercel (${deploymentEnv})`,
  });
}
