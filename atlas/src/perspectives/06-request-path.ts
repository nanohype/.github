import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * The data path, end to end. This is the page the campaign's recurring bug
 * class lives on: every failure in the "healthy control plane, dead data path"
 * family was a break in exactly one of these hops, invisible to every manifest
 * gate because the control plane reported Ready throughout.
 */
export const requestPath: Perspective = {
  id: "request-path",
  name: "6 · Request path",
  blurb:
    "One invocation, app to model and back. The app holds no AWS credential and signs nothing — the gateway does, as the tenant.",
  lanes: [
    [
      {
        id: "app",
        title: "Tenant namespace",
        note: "tenants-<platform> · the app's whole world",
        color: SEMANTIC.tenant,
        cols: 2,
        nodes: [
          { id: "pod", step: 1, label: "agent pod", sub: "tenant image · agent loop", color: SEMANTIC.tenant },
          { id: "routeenv", label: "MODEL_ROUTE_BASE_URL", sub: "+ _API · from status.routes[]", color: SEMANTIC.platform },
          { id: "sdk", label: "in-process tools", sub: "run as the tenant, not a server", color: SEMANTIC.tenant },
          { id: "otlpapp", label: "OTLP :4317", sub: "span + correlation_id", color: SEMANTIC.telemetry },
        ],
      },
      {
        id: "gw",
        title: "The gateway · same namespace",
        note: "Envoy, under the tenant ServiceAccount",
        color: SEMANTIC.platform,
        cols: 2,
        nodes: [
          { id: "listener", step: 2, label: "Gateway listener", sub: "/anthropic/v1/messages", color: SEMANTIC.platform, accent: true },
          { id: "extproc", step: 3, label: "extproc body parser", sub: "registered per endpoint path", color: SEMANTIC.security, accent: true },
          { id: "rule", step: 4, label: "AIGatewayRoute rule", sub: "matches x-ai-eg-model", color: SEMANTIC.platform },
          { id: "override", step: 5, label: "modelNameOverride", sub: "route name → Bedrock id", color: SEMANTIC.platform },
          { id: "bsp", step: 6, label: "BackendSecurityPolicy", sub: "SigV4, as the tenant role", color: SEMANTIC.security },
          { id: "ratelimit", label: "BackendTrafficPolicy", sub: "per-route rate limit", color: SEMANTIC.security },
        ],
      },
    ],
    [
      {
        id: "aws",
        title: "AWS",
        note: "inference leaves the cluster; nothing else does",
        color: SEMANTIC.model,
        cols: 2,
        nodes: [
          { id: "pl", step: 7, label: "PrivateLink endpoint", sub: "bedrock-runtime", color: SEMANTIC.aws },
          { id: "guard", step: 8, label: "Bedrock Guardrails", sub: "input, then output policy", color: SEMANTIC.security },
          { id: "bedrock", step: 9, label: "Bedrock InvokeModel", sub: "in-region or CRIS profile", color: SEMANTIC.model },
          { id: "invlog", step: 10, label: "invocation log group", sub: "modelId · tokens · identity", color: SEMANTIC.telemetry },
        ],
      },
      {
        id: "capture",
        title: "Capture + cost",
        note: "the record the agent's account gets checked against",
        color: SEMANTIC.telemetry,
        cols: 2,
        nodes: [
          { id: "worm", label: "WORM capture", sub: "Object Lock · GOVERNANCE", color: SEMANTIC.security },
          { id: "lambda", step: 11, label: "invocation-cost-publisher", sub: "subscription filter → Lambda", color: SEMANTIC.aws },
          { id: "metric", step: 12, label: "EstimatedInvocationCost", sub: "Usd · dimension: PlatformId", color: SEMANTIC.aws },
          { id: "cur", label: "CUR → Athena", sub: "resource_tags_user_platformid", color: SEMANTIC.aws },
        ],
      },
      {
        id: "obs",
        title: "Signals",
        note: "one collector, tier-blind",
        color: SEMANTIC.telemetry,
        cols: 1,
        nodes: [
          { id: "coll", label: "OTel Collector", sub: "telemetry.monitoring:4317", color: SEMANTIC.telemetry },
          { id: "attrs", label: "agents.tenant · .platform", sub: "resource attrs, not self-report", color: SEMANTIC.telemetry },
        ],
      },
    ],
  ],
  edges: [
    { from: "routeenv", to: "pod", label: "wired by the operator", color: SEMANTIC.platform, dashed: true },
    { from: "pod", to: "listener", label: "POST · no credential", color: SEMANTIC.tenant },
    { from: "sdk", to: "pod", dashed: true, color: SEMANTIC.tenant },
    { from: "listener", to: "extproc", label: "reads the body", color: SEMANTIC.security },
    { from: "extproc", to: "rule", label: "sets the header", color: SEMANTIC.platform },
    { from: "rule", to: "override", color: SEMANTIC.platform },
    { from: "ratelimit", to: "rule", dashed: true, color: SEMANTIC.security },
    { from: "override", to: "bsp", color: SEMANTIC.platform },
    { from: "bsp", to: "pl", label: "SigV4", color: SEMANTIC.security },
    { from: "pl", to: "guard", color: SEMANTIC.aws },
    { from: "guard", to: "bedrock", color: SEMANTIC.model },
    { from: "bedrock", to: "invlog", color: SEMANTIC.telemetry },
    { from: "invlog", to: "lambda", label: "subscription filter", color: SEMANTIC.aws },
    { from: "lambda", to: "metric", label: "PutMetricData", color: SEMANTIC.aws },
    { from: "metric", to: "cur", label: "reconciled against", color: SEMANTIC.aws, dashed: true },
    { from: "listener", to: "worm", label: "captures req + resp", color: SEMANTIC.security },
    { from: "otlpapp", to: "coll", color: SEMANTIC.telemetry },
    { from: "pod", to: "otlpapp", color: SEMANTIC.telemetry },
    { from: "listener", to: "coll", label: "token + cost attrs", color: SEMANTIC.telemetry },
    { from: "attrs", to: "coll", dashed: true, color: SEMANTIC.telemetry },
  ],
  callouts: [
    {
      lane: 0,
      title: "Steps 2 and 3 are where this breaks",
      body: "extproc registers a body-parsing processor per endpoint path. A request to an unregistered prefix never has its model read out of the body, never gets x-ai-eg-model, and matches no route — so every call fails while the Gateway still reports healthy.",
      color: SEMANTIC.security,
    },
    {
      lane: 1,
      title: "The app signs nothing",
      body: "It holds no AWS credential. Envoy signs SigV4 as the tenant ServiceAccount, so the audit record and the agent's own account of what it did name the same principal.",
      color: SEMANTIC.note,
    },
  ],
};
