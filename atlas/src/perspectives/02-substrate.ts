import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * The landing-zone component inventory, by layer. Names match
 * `git ls-files components/aws/ | cut -d/ -f3` — the same source
 * `scripts/check-architecture-components.sh` gates the docs against.
 */
export const substrate: Perspective = {
  id: "substrate",
  name: "2 · Cloud substrate",
  blurb:
    "landing-zone, by layer. Organization components run once in the management account; everything below them is per-environment.",
  lanes: [
    [
      {
        id: "orgl",
        title: "Organization layer",
        note: "management account · cross-account governance",
        color: SEMANTIC.security,
        cols: 4,
        nodes: [
          { id: "org-identity", label: "org-identity", sub: "IAM Identity Center · SSO", color: SEMANTIC.security },
          { id: "org-security", label: "org-security", sub: "GuardDuty · Security Hub", color: SEMANTIC.security },
          { id: "org-compliance", label: "org-compliance", sub: "CloudTrail · Config · KMS", color: SEMANTIC.security },
          { id: "org-scp", label: "org-scp", sub: "Service Control Policies", color: SEMANTIC.security },
          { id: "org-networking", label: "org-networking", sub: "Transit Gateway · IPAM", color: SEMANTIC.aws },
          { id: "org-cost", label: "org-cost", sub: "budgets · CUR 2.0 export", color: SEMANTIC.aws },
          { id: "org-backup", label: "org-backup", sub: "delegated admin + policy", color: SEMANTIC.aws },
          { id: "governance", label: "governance", sub: "audit buckets · EventBridge", color: SEMANTIC.security },
        ],
      },
    ],
    [
      {
        id: "netl",
        title: "Network layer",
        note: "one VPC per environment — owned or adopted",
        color: SEMANTIC.aws,
        cols: 2,
        nodes: [
          { id: "network", label: "network", sub: "create | adopt · one contract", color: SEMANTIC.aws },
          { id: "shared-network", label: "shared-network", sub: "owner side of adopt", color: SEMANTIC.aws },
          { id: "egress-network", label: "egress-network", sub: "central egress hub", color: SEMANTIC.aws },
          { id: "dns", label: "dns", sub: "Route53 zones · ACM", color: SEMANTIC.aws },
          { id: "private-dns", label: "private-dns", sub: "PHZ · create | adopt", color: SEMANTIC.aws },
          { id: "shared-dns", label: "shared-dns", sub: "Route53 profile owner", color: SEMANTIC.aws },
        ],
      },
      {
        id: "clusterl",
        title: "Cluster layer",
        note: "cluster-bootstrap is the GitOps boundary",
        color: SEMANTIC.k8s,
        cols: 1,
        nodes: [
          { id: "cluster", label: "cluster", sub: "EKS · Karpenter · access", color: SEMANTIC.k8s },
          { id: "cluster-bootstrap", label: "cluster-bootstrap", sub: "Cilium CNI + ArgoCD", color: SEMANTIC.k8s },
          { id: "cluster-addons", label: "cluster-addons", sub: "Pod Identity roles", color: SEMANTIC.k8s },
        ],
      },
      {
        id: "fleetl",
        title: "Fleet + portal",
        note: "hub/spoke slots",
        color: SEMANTIC.platform,
        cols: 1,
        nodes: [
          { id: "fleet-hub", label: "fleet-hub", sub: "vending control plane", color: SEMANTIC.platform },
          { id: "fleet-vend", label: "fleet-vend", sub: "cross-account vend role", color: SEMANTIC.platform },
          { id: "portal-hub", label: "portal-hub / -spoke", sub: "portal's own substrate", color: SEMANTIC.platform },
        ],
      },
    ],
    [
      {
        id: "workl",
        title: "Workload layer",
        note: "a tenant's stores are a declaration, not a component",
        color: SEMANTIC.tenant,
        cols: 2,
        nodes: [
          { id: "tenant-substrate", label: "tenant-substrate", sub: "from Platform.spec.datastores", color: SEMANTIC.tenant, wide: true },
          { id: "agent-iam", label: "agent-iam", sub: "permissions boundary", color: SEMANTIC.security },
          { id: "model-import", label: "model-import", sub: "open-weight import path", color: SEMANTIC.model },
          { id: "druid", label: "druid", sub: "Aurora · MSK · per tenant", color: SEMANTIC.tenant },
          { id: "pipeline", label: "pipeline", sub: "Batch · Glue · data lake", color: SEMANTIC.tenant },
        ],
      },
      {
        id: "opsl",
        title: "Operational layer",
        note: "the run-it-in-production half",
        color: SEMANTIC.telemetry,
        cols: 3,
        nodes: [
          { id: "observability", label: "observability", sub: "alarms · SNS · dashboards", color: SEMANTIC.telemetry },
          { id: "managed-monitoring", label: "managed-monitoring", sub: "AMP + Amazon Grafana", color: SEMANTIC.telemetry },
          { id: "shared-observability", label: "shared-observability", sub: "fleet-wide alarm sink", color: SEMANTIC.telemetry },
          { id: "backup", label: "backup", sub: "plans · vault lock", color: SEMANTIC.aws },
          { id: "shared-backup", label: "shared-backup", sub: "copy vault · 2nd account", color: SEMANTIC.aws },
          { id: "secrets", label: "secrets", sub: "CMKs + Secrets Manager", color: SEMANTIC.security },
          { id: "break-glass", label: "break-glass", sub: "emergency roles + alerts", color: SEMANTIC.security },
          { id: "cost", label: "cost", sub: "budgets · anomaly detection", color: SEMANTIC.aws },
          { id: "github-oidc", label: "github-oidc", sub: "no long-lived keys", color: SEMANTIC.security },
          { id: "service-quotas", label: "service-quotas", sub: "utilisation alarms", color: SEMANTIC.aws },
          { id: "org-compliance-2", label: "fleet-unwedge", sub: "breaks a stuck vend", color: SEMANTIC.platform },
          { id: "cost-2", label: "org-cost rollup", sub: "CUR → Athena", color: SEMANTIC.aws },
        ],
      },
    ],
  ],
  // A layer stack read top to bottom already says what depends on what. Only
  // the edges that cross an account or an ownership boundary are drawn.
  edges: [
    { from: "org-networking", to: "network", label: "IPAM + TGW via RAM", color: SEMANTIC.aws, dashed: true },
    { from: "shared-network", to: "network", label: "RAM-shares subnets", color: SEMANTIC.aws },
    { from: "network", to: "cluster", label: "one output contract", color: SEMANTIC.aws },
    { from: "org-scp", to: "tenant-substrate", label: "EnforceMandatoryTags", color: SEMANTIC.security, dashed: true },
    { from: "backup", to: "shared-backup", label: "copies cross-account", color: SEMANTIC.aws },
  ],
  callouts: [
    {
      lane: 2,
      title: "A tenant is a declaration",
      body: "Adding a tenant edits a map. Its databases, buckets, queues and caches are written on Platform.spec.datastores and provisioned by the generic tenant-substrate module — there is no per-app component to write.",
      color: SEMANTIC.tenant,
    },
  ],
};
