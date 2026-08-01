import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * The eks-gitops addon catalog, grouped by ArgoCD sync wave. Waves are read
 * from each ApplicationSet's `argocd.argoproj.io/sync-wave` annotation — the
 * ordering is the contract, so the lanes here are the waves rather than a
 * tidier grouping that would hide it.
 */
export const addons: Perspective = {
  id: "addons",
  name: "4 · Cluster addons",
  blurb:
    "One ApplicationSet per group, ordered by sync wave. A cluster opts in with a label; the generators do the rest.",
  lanes: [
    [
      {
        id: "w0",
        title: "Waves 0–2 · bootstrap",
        note: "nothing else can reconcile until these are up",
        color: SEMANTIC.k8s,
        cols: 3,
        nodes: [
          { id: "certmgr", label: "cert-manager", sub: "wave 0", color: SEMANTIC.k8s },
          { id: "eso", label: "external-secrets", sub: "wave 0", color: SEMANTIC.security },
          { id: "metrics", label: "metrics-server", sub: "wave 0", color: SEMANTIC.telemetry },
          { id: "promcrds", label: "prometheus-operator-crds", sub: "wave 0", color: SEMANTIC.telemetry },
          { id: "storage", label: "storage-classes", sub: "wave 0", color: SEMANTIC.k8s },
          { id: "prio", label: "priority-classes", sub: "wave 0", color: SEMANTIC.k8s },
          { id: "cilium2", label: "cilium", sub: "wave 1 · networking", color: SEMANTIC.k8s },
          { id: "extdns", label: "external-dns", sub: "wave 1", color: SEMANTIC.k8s },
          { id: "secretstores", label: "secret-stores", sub: "wave 1", color: SEMANTIC.security },
        ],
      },
      {
        id: "w5",
        title: "Waves 5–20 · compute + policy",
        note: "nodes, then the rules that govern them",
        color: SEMANTIC.security,
        cols: 2,
        nodes: [
          { id: "karp", label: "karpenter", sub: "wave 5", color: SEMANTIC.k8s },
          { id: "accel", label: "gpu-operator · NVIDIA DRA", sub: "wave 6", color: SEMANTIC.k8s },
          { id: "kyverno", label: "kyverno", sub: "wave 10", color: SEMANTIC.security },
          { id: "falco", label: "falco", sub: "wave 10", color: SEMANTIC.security },
          { id: "trivy", label: "trivy-operator", sub: "wave 10", color: SEMANTIC.security },
          { id: "kpol", label: "kyverno-policies", sub: "wave 20", color: SEMANTIC.security },
        ],
      },
    ],
    [
      {
        id: "w30",
        title: "Waves 30–32 · observability",
        note: "the OTLP waist and its backends",
        color: SEMANTIC.telemetry,
        cols: 3,
        nodes: [
          { id: "ksm", label: "kube-state-metrics", sub: "wave 30", color: SEMANTIC.telemetry },
          { id: "grafop", label: "grafana-operator", sub: "wave 30", color: SEMANTIC.telemetry },
          { id: "loki", label: "loki", sub: "wave 30", color: SEMANTIC.telemetry },
          { id: "opencost", label: "opencost", sub: "wave 30", color: SEMANTIC.aws },
          { id: "gwapi", label: "gateway-api-crds", sub: "wave 30", color: SEMANTIC.k8s },
          { id: "tempo", label: "tempo", sub: "wave 31", color: SEMANTIC.telemetry },
          { id: "otelagent", label: "otel-agent", sub: "wave 32 · DaemonSet", color: SEMANTIC.telemetry },
          { id: "otelgw", label: "otel-gateway", sub: "wave 32 · full tier", color: SEMANTIC.telemetry },
          { id: "otelfloor", label: "otel-gateway-floor", sub: "wave 32 · floor tier", color: SEMANTIC.telemetry },
        ],
      },
      {
        id: "w21",
        title: "Wave 21",
        note: "CRDs before the CRs",
        color: SEMANTIC.platform,
        cols: 1,
        nodes: [
          { id: "agentop", label: "agent-operator", sub: "eks-agent-platform CRDs", color: SEMANTIC.platform },
        ],
      },
    ],
    [
      {
        id: "w40",
        title: "Waves 40–44 · the AI platform",
        note: "gateway before operator before tenants",
        color: SEMANTIC.platform,
        cols: 3,
        nodes: [
          { id: "envoygw", label: "envoy-gateway", sub: "wave 40", color: SEMANTIC.platform },
          { id: "aigwcrds", label: "envoy-ai-gateway-crds", sub: "wave 40", color: SEMANTIC.platform },
          { id: "aigw", label: "envoy-ai-gateway", sub: "wave 40", color: SEMANTIC.platform },
          { id: "keda", label: "keda", sub: "wave 40 · operations", color: SEMANTIC.k8s },
          { id: "velero", label: "velero", sub: "wave 40", color: SEMANTIC.aws },
          { id: "descheduler", label: "descheduler · VPA · goldilocks", sub: "wave 40–42", color: SEMANTIC.k8s },
          { id: "agentplat", label: "agent-platform", sub: "wave 44 · the Platform CRs", color: SEMANTIC.platform },
        ],
      },
      {
        id: "w50",
        title: "Waves 50–60",
        note: "workflow engine, then the dashboards that read it",
        color: SEMANTIC.gitops,
        cols: 2,
        nodes: [
          { id: "argoev", label: "argo-events · rollouts", sub: "wave 50", color: SEMANTIC.gitops },
          { id: "argowf", label: "argo-workflows", sub: "wave 52", color: SEMANTIC.gitops },
          { id: "dash", label: "dashboards", sub: "wave 60 · GrafanaDashboard", color: SEMANTIC.telemetry },
        ],
      },
    ],
  ],
  // The wave number is printed on every box, so redrawing the ordering as
  // eighteen arrows restated what the labels already said and buried the four
  // dependencies that are load-bearing rather than merely sequential.
  edges: [
    { from: "kyverno", to: "kpol", label: "CRDs before policies", color: SEMANTIC.security },
    { from: "gwapi", to: "envoygw", label: "Gateway API CRDs first", color: SEMANTIC.k8s },
    { from: "agentop", to: "agentplat", label: "CRDs before CRs", color: SEMANTIC.platform },
    { from: "otelagent", to: "otelgw", label: "forwards :4317", color: SEMANTIC.telemetry },
  ],
  callouts: [
    {
      lane: 1,
      title: "Two gateways, never both",
      body: "otel-gateway and otel-gateway-floor answer on the same telemetry.monitoring alias, and their ApplicationSets select mutually exclusive tiers. A tenant chart is byte-identical across them.",
      color: SEMANTIC.telemetry,
    },
    {
      lane: 2,
      title: "The wave is the contract",
      body: "A cluster opts in with one label and the generators do the rest. Ordering lives in the sync-wave annotation, so ArgoCD enforces it rather than anyone remembering an install order.",
      color: SEMANTIC.gitops,
    },
  ],
};
