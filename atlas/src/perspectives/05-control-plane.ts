import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * Ten CRDs, nine reconcilers, one binary.
 *
 * Structured so that **a zone is a reconciler and its contents are what that
 * reconciler emits**. The previous shape — three lanes of CRs, reconcilers and
 * outputs, wired many-to-many — needed twenty-seven arrows to say "this
 * controller owns these objects", and every one of them crossed the lane
 * between. Ownership is the one relationship position expresses for free, so
 * it costs no arrows at all here; the four that remain are the relationships
 * position genuinely cannot show.
 */
export const controlPlane: Perspective = {
  id: "control-plane",
  name: "5 · Control plane",
  blurb:
    "One binary, nine reconcilers, one leader-election lease. Each zone below is a reconciler; what sits inside it is what that reconciler creates and keeps true.",
  lanes: [
    [
      {
        id: "crds",
        title: "The CRD surface · v1alpha1",
        note: "three capability groups under nanohype.dev — the whole public API",
        color: SEMANTIC.platform,
        cols: 5,
        nodes: [
          { id: "tenant", label: "Tenant", sub: "platform. · cluster-scoped", color: SEMANTIC.platform },
          { id: "platform", label: "Platform", sub: "platform. · the boundary", color: SEMANTIC.platform, accent: true },
          { id: "gateway", label: "ModelGateway", sub: "agents.", color: SEMANTIC.platform },
          { id: "fleet", label: "AgentFleet", sub: "agents.", color: SEMANTIC.platform },
          { id: "sandbox", label: "AgentSandbox", sub: "agents.", color: SEMANTIC.platform },
          { id: "pool", label: "SandboxPool", sub: "agents.", color: SEMANTIC.platform },
          { id: "batch", label: "BatchJob", sub: "agents.", color: SEMANTIC.platform },
          { id: "budget", label: "BudgetPolicy", sub: "governance.", color: SEMANTIC.aws },
          { id: "eval", label: "EvalSuite", sub: "governance.", color: SEMANTIC.telemetry },
          { id: "slo", label: "SLOPolicy", sub: "governance.", color: SEMANTIC.telemetry },
        ],
      },
    ],
    [
      {
        id: "r-platform",
        title: "platform",
        note: "60s · drift-detects the suspension tag",
        color: SEMANTIC.note,
        cols: 2,
        nodes: [
          { id: "ns", label: "tenants-<platform> ns", sub: "PSS restricted", color: SEMANTIC.k8s },
          { id: "quota", label: "ResourceQuota", sub: "+ LimitRange", color: SEMANTIC.k8s },
          { id: "netpol", label: "default-deny egress", sub: "+ Cilium rules", color: SEMANTIC.security },
          { id: "appproj", label: "AppProject", sub: "ArgoCD blast radius", color: SEMANTIC.gitops },
          { id: "role", label: "tenant IAM role", sub: "<env>-<platform>-tenant", color: SEMANTIC.security, accent: true },
          { id: "grant", label: "KMS grant", sub: "context: PlatformId", color: SEMANTIC.security },
          { id: "s3pol", label: "S3 bucket policy", sub: "s3:prefix condition", color: SEMANTIC.security },
          { id: "modelpol", label: "Bedrock model access", sub: "from allowedModels", color: SEMANTIC.model },
        ],
      },
      {
        id: "r-runtime",
        title: "runtime",
        note: "30s when Pending",
        color: SEMANTIC.note,
        cols: 1,
        nodes: [
          { id: "sa", label: "ServiceAccount", sub: "tenant-runtime", color: SEMANTIC.security },
          { id: "podid", label: "Pod Identity assoc.", sub: "no role-arn ever pasted", color: SEMANTIC.security },
          { id: "deploy", label: "Deployment per agent", sub: "the tenant's own image", color: SEMANTIC.tenant, accent: true },
          { id: "scaled", label: "KEDA ScaledObject", sub: "SQS depth, else CPU", color: SEMANTIC.k8s },
        ],
      },
      {
        id: "r-gateway",
        title: "gateway",
        note: "30s when Pending",
        color: SEMANTIC.note,
        cols: 1,
        nodes: [
          { id: "gw", label: "Gateway + EnvoyProxy", sub: "the data-plane shape", color: SEMANTIC.platform },
          { id: "airoute", label: "AIGatewayRoute", sub: "one rule per route", color: SEMANTIC.platform },
          { id: "backends", label: "AIServiceBackend", sub: "+ BackendSecurityPolicy", color: SEMANTIC.security },
          { id: "routes", label: "status.routes[]", sub: "the published contract", color: SEMANTIC.platform, accent: true },
        ],
      },
    ],
    [
      {
        id: "r-gov",
        title: "budget · eval · slo",
        note: "the three loops that can stop a tenant",
        color: SEMANTIC.note,
        cols: 3,
        nodes: [
          { id: "spend", label: "status.currentSpend", sub: "Athena CUR + in-flight", color: SEMANTIC.aws },
          { id: "breach", label: "EventBridge BudgetBreach", sub: "at ≥120%", color: SEMANTIC.aws },
          { id: "cronwf", label: "Argo CronWorkflow", sub: "eval-runner template", color: SEMANTIC.telemetry },
          { id: "score", label: "status.lastScore", sub: "gates a Rollout", color: SEMANTIC.telemetry },
          { id: "burn", label: "burn-rate rules", sub: "PrometheusRule", color: SEMANTIC.telemetry },
          { id: "hold", label: "ArgoCD sync hold", sub: "single-writer on AppProject", color: SEMANTIC.gitops },
        ],
      },
      {
        id: "r-sandbox",
        title: "sandbox · agentsandbox · batch",
        note: "15s while Running · TTL-collected",
        color: SEMANTIC.note,
        cols: 2,
        nodes: [
          { id: "worker", label: "pool worker Deployment", sub: "+ metrics bridge", color: SEMANTIC.tenant },
          { id: "session", label: "single-use session Pod", sub: "hardened · default-deny", color: SEMANTIC.security },
          { id: "batchjob", label: "AWS Batch submission", sub: "off-cluster compute", color: SEMANTIC.aws },
          { id: "ttl", label: "TTL garbage collection", sub: "no pod outlives its session", color: SEMANTIC.security },
        ],
      },
      {
        id: "r-target",
        title: "target client",
        note: "resolved at the top of every workload reconcile",
        color: SEMANTIC.note,
        cols: 1,
        nodes: [
          { id: "host", label: "host API", sub: "isolation: namespace", color: SEMANTIC.k8s },
          { id: "vc", label: "vcluster API", sub: "isolation: vcluster", color: SEMANTIC.security },
        ],
      },
    ],
  ],
  edges: [
    // Only what adjacency cannot say. Each of these crosses an ownership
    // boundary, which is exactly when an arrow earns its place.
    { from: "routes", to: "deploy", label: "read by the agent", color: SEMANTIC.platform },
    { from: "role", to: "podid", label: "bound to the SA", color: SEMANTIC.security, dashed: true },
    { from: "breach", to: "role", label: "detaches the baseline", color: SEMANTIC.aws },
    { from: "vc", to: "deploy", label: "or here", color: SEMANTIC.security, dashed: true },
  ],
  callouts: [
    {
      lane: 1,
      title: "Why one binary",
      body: "Nine reconcilers share a single leader-election lease. Splitting them is trivial if one outgrows the rest; running six deployments before that happens is just more to operate.",
      color: SEMANTIC.note,
    },
    {
      lane: 2,
      title: "Fast state here, slow state in OpenTofu",
      body: "Per-tenant IAM, KMS grants and model access reconcile through the AWS SDK because a Platform apply must not wait on a Terragrunt run. Buckets, keys, endpoints and the event bus stay in landing-zone.",
      color: SEMANTIC.aws,
    },
  ],
};
