import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * The OTLP waist. A tenant chart is byte-identical across tiers because the
 * tier is a property of the cluster, not something every application has to
 * know about — the two gateways never coexist, and both answer on the same
 * `telemetry.monitoring.svc` alias.
 */
export const observability: Perspective = {
  id: "observability",
  name: "8 · Observability",
  blurb:
    "One neutral waist. Producers emit OTLP to a stable alias; which backends exist behind it is a property of the cluster tier.",
  lanes: [
    [
      {
        id: "producers",
        title: "Producers",
        note: "everything carries agents.tenant and agents.platform",
        color: SEMANTIC.tenant,
        cols: 3,
        nodes: [
          { id: "agentpod", label: "AgentFleet pods", sub: "attrs on the PodSpec", color: SEMANTIC.tenant },
          { id: "sandboxpod", label: "AgentSandbox · pool workers", sub: "OTEL_RESOURCE_ATTRIBUTES", color: SEMANTIC.tenant },
          { id: "evalstep", label: "eval-runner step", sub: "attrs from workflow params", color: SEMANTIC.gitops },
          { id: "envoypod", label: "gateway Envoy", sub: "attributable by label", color: SEMANTIC.platform },
          { id: "operator", label: "operator", sub: "reconcile metrics + SLO", color: SEMANTIC.platform },
          { id: "ksm2", label: "kube-state-metrics", sub: "CR state as metrics", color: SEMANTIC.telemetry },
        ],
      },
    ],
    [
      {
        id: "waist",
        title: "The waist",
        note: "telemetry.monitoring.svc:4317 — the same name in every tier",
        color: SEMANTIC.telemetry,
        cols: 2,
        nodes: [
          { id: "agent", label: "otel-agent", sub: "DaemonSet · enriches k8s.*", color: SEMANTIC.telemetry },
          { id: "gwfull", label: "otel-gateway", sub: "full tier", color: SEMANTIC.telemetry },
          { id: "gwfloor", label: "otel-gateway-floor", sub: "floor tier · same names", color: SEMANTIC.telemetry },
          { id: "proc", label: "processors", sub: "limiter · resource · PII · batch", color: SEMANTIC.security },
        ],
      },
      {
        id: "backends",
        title: "Backends",
        note: "the tier is which of these exist",
        color: SEMANTIC.aws,
        cols: 2,
        nodes: [
          { id: "amp", label: "Amazon Managed Prometheus", sub: "full tier", color: SEMANTIC.telemetry },
          { id: "loki2", label: "Loki", sub: "full tier", color: SEMANTIC.telemetry },
          { id: "tempo2", label: "Tempo", sub: "full tier", color: SEMANTIC.telemetry },
          { id: "cwemf", label: "CloudWatch EMF + Logs", sub: "floor tier", color: SEMANTIC.aws },
        ],
      },
    ],
    [
      {
        id: "consumers",
        title: "Consumers",
        note: "per-persona, not per-service",
        color: SEMANTIC.telemetry,
        cols: 3,
        nodes: [
          { id: "graf", label: "Amazon Grafana", sub: "SSO role associations", color: SEMANTIC.telemetry },
          { id: "dashfin", label: "Finance dashboard", sub: "spend · top-N · forecast", color: SEMANTIC.aws },
          { id: "dashops", label: "Ops dashboard", sub: "queue depth · p50/95/99", color: SEMANTIC.telemetry },
          { id: "dashexec", label: "Founder dashboard", sub: "tenants live · weekly trend", color: SEMANTIC.telemetry },
          { id: "alarms", label: "CloudWatch alarms", sub: "severity SNS topics", color: SEMANTIC.aws },
          { id: "am", label: "Alertmanager", sub: "PagerDuty · persona Slack", color: SEMANTIC.security },
        ],
      },
      {
        id: "slo",
        title: "SLOPolicy · a control loop",
        note: "burn rate is not just an alert here",
        color: SEMANTIC.platform,
        cols: 1,
        nodes: [
          { id: "slopol", label: "SLOPolicy CR", sub: "objective + windows", color: SEMANTIC.platform },
          { id: "burn", label: "burn-rate query", sub: "multi-window", color: SEMANTIC.telemetry },
          { id: "hold", label: "holds ArgoCD sync", sub: "single-writer on AppProject", color: SEMANTIC.gitops },
        ],
      },
    ],
  ],
  edges: [
    { from: "agentpod", to: "agent", color: SEMANTIC.telemetry },
    { from: "sandboxpod", to: "agent", color: SEMANTIC.telemetry },
    { from: "evalstep", to: "agent", color: SEMANTIC.telemetry },
    { from: "envoypod", to: "gwfull", label: "direct OTLP", color: SEMANTIC.telemetry },
    { from: "operator", to: "agent", color: SEMANTIC.telemetry },
    { from: "ksm2", to: "amp", color: SEMANTIC.telemetry },
    { from: "agent", to: "gwfull", label: ":4317", color: SEMANTIC.telemetry },
    { from: "agent", to: "gwfloor", label: "same alias", color: SEMANTIC.telemetry, dashed: true },
    { from: "proc", to: "gwfull", dashed: true, color: SEMANTIC.security },
    { from: "gwfull", to: "amp", color: SEMANTIC.telemetry },
    { from: "gwfull", to: "loki2", color: SEMANTIC.telemetry },
    { from: "gwfull", to: "tempo2", color: SEMANTIC.telemetry },
    { from: "gwfloor", to: "cwemf", color: SEMANTIC.aws },
    { from: "amp", to: "graf", color: SEMANTIC.telemetry },
    { from: "cwemf", to: "graf", color: SEMANTIC.aws },
    { from: "graf", to: "dashfin", color: SEMANTIC.aws },
    { from: "graf", to: "dashops", color: SEMANTIC.telemetry },
    { from: "graf", to: "dashexec", color: SEMANTIC.telemetry },
    { from: "cwemf", to: "alarms", color: SEMANTIC.aws },
    { from: "amp", to: "am", color: SEMANTIC.security },
    { from: "amp", to: "burn", color: SEMANTIC.telemetry },
    { from: "slopol", to: "burn", color: SEMANTIC.platform },
    { from: "burn", to: "hold", label: "breach", color: SEMANTIC.gitops },
  ],
};
