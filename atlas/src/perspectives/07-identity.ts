import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * Identity and isolation. Two CMKs per cluster, isolated by grant rather than
 * by key — tenant A's role cannot decrypt tenant B's objects because B's data
 * is encrypted under an EncryptionContext A was never granted.
 */
export const identity: Perspective = {
  id: "identity",
  name: "7 · Identity & isolation",
  blurb:
    "Isolation is a spectrum, not a boolean. Two orthogonal dials — where the control-plane CRs live, and how hard the workload boundary is.",
  lanes: [
    [
      {
        id: "principal",
        title: "The principal chain",
        note: "no role ARN is ever pasted into a chart",
        color: SEMANTIC.security,
        cols: 2,
        nodes: [
          { id: "sa", label: "ServiceAccount", sub: "tenant-runtime", color: SEMANTIC.k8s },
          { id: "assoc", label: "Pod Identity association", sub: "operator-reconciled", color: SEMANTIC.security },
          { id: "role", label: "tenant IAM role", sub: "<env>-<platform>-tenant", color: SEMANTIC.security },
          { id: "boundary", label: "permissions boundary", sub: "agent-iam · clamps the role", color: SEMANTIC.security },
        ],
      },
      {
        id: "grants",
        title: "What that role can reach",
        note: "every Resource scoped by naming convention or exact ARN",
        color: SEMANTIC.aws,
        cols: 2,
        nodes: [
          { id: "kmsdata", label: "cmk-data grant", sub: "EncryptionContext PlatformId", color: SEMANTIC.security },
          { id: "s3", label: "S3 prefix", sub: "s3:prefix condition", color: SEMANTIC.aws },
          { id: "stores", label: "declared datastores", sub: "<env>-<platform>-<store>", color: SEMANTIC.tenant },
          { id: "secret", label: "master secret ARN", sub: "exact, read from SSM", color: SEMANTIC.security },
          { id: "models", label: "allowedModels", sub: "profile + underlying FM", color: SEMANTIC.model },
          { id: "directsec", label: "directSecretReads", sub: "namespace-prefixed only", color: SEMANTIC.security },
        ],
      },
    ],
    [
      {
        id: "keys",
        title: "Two CMKs, per cluster",
        note: "a breach of the auditor role surfaces history, not content",
        color: SEMANTIC.security,
        cols: 2,
        nodes: [
          { id: "cmkdata", label: "cmk-data", sub: "artifacts · audit · archive", color: SEMANTIC.security },
          { id: "cmklogs", label: "cmk-logs", sub: "log groups · invocation logs", color: SEMANTIC.security },
          { id: "auditor", label: "auditor role", sub: "decrypt on cmk-logs ONLY", color: SEMANTIC.security },
          { id: "noaudit", label: "no decrypt on cmk-data", sub: "oversight ≠ data access", color: SEMANTIC.note },
        ],
      },
      {
        id: "tiers",
        title: "Isolation tiers",
        note: "growing up a tier is a value change, never a migration",
        color: SEMANTIC.platform,
        cols: 1,
        nodes: [
          { id: "t1", label: "shared control-plane ns", sub: "default · lowest ceremony", color: SEMANTIC.platform },
          { id: "t2", label: "eap-tenant-<name>", sub: "dedicated control-plane ns", color: SEMANTIC.platform },
          { id: "t3", label: "isolation: vcluster", sub: "API-server isolation", color: SEMANTIC.platform },
          { id: "t4", label: "dedicated cluster", sub: "regulated · sovereign", color: SEMANTIC.platform },
        ],
      },
      {
        id: "admission",
        title: "Cluster-side enforcement",
        note: "the boundary the tenant cannot reach around",
        color: SEMANTIC.security,
        cols: 1,
        nodes: [
          { id: "pss", label: "PSS restricted", sub: "namespace label", color: SEMANTIC.security },
          { id: "kyverno", label: "Kyverno policies", sub: "non-root · limits · images", color: SEMANTIC.security },
          { id: "netpol", label: "default-deny egress", sub: "+ Cilium egress rules", color: SEMANTIC.security },
          { id: "appproj", label: "AppProject", sub: "ArgoCD blast radius", color: SEMANTIC.gitops },
        ],
      },
    ],
    [
      {
        id: "orgwide",
        title: "Above the account",
        note: "guardrails no workload role can escape",
        color: SEMANTIC.security,
        cols: 4,
        nodes: [
          { id: "scp", label: "Service Control Policies", sub: "org-scp · OU-attached", color: SEMANTIC.security },
          { id: "tagscp", label: "EnforceMandatoryTags", sub: "PlatformId + DataClassification", color: SEMANTIC.note },
          { id: "gd", label: "GuardDuty · Security Hub", sub: "S3 · EKS · malware · RDS", color: SEMANTIC.security },
          { id: "ct", label: "org CloudTrail", sub: "one trail, all accounts", color: SEMANTIC.security },
          { id: "bg", label: "break-glass roles", sub: "SNS alert on assumption", color: SEMANTIC.security },
          { id: "oidc", label: "GitHub OIDC", sub: "repo-scoped, no static keys", color: SEMANTIC.security },
          { id: "sso", label: "IAM Identity Center", sub: "permission sets · groups", color: SEMANTIC.security },
          { id: "cg", label: "cloudgov", sub: "least-privilege + drift audit", color: SEMANTIC.security },
        ],
      },
    ],
  ],
  edges: [
    { from: "sa", to: "assoc", color: SEMANTIC.security },
    { from: "assoc", to: "role", color: SEMANTIC.security },
    { from: "boundary", to: "role", label: "clamps", color: SEMANTIC.security, dashed: true },
    { from: "role", to: "kmsdata", color: SEMANTIC.security },
    { from: "role", to: "s3", color: SEMANTIC.aws },
    { from: "role", to: "stores", color: SEMANTIC.tenant },
    { from: "role", to: "secret", color: SEMANTIC.security },
    { from: "role", to: "models", color: SEMANTIC.model },
    { from: "role", to: "directsec", color: SEMANTIC.security },
    { from: "kmsdata", to: "cmkdata", color: SEMANTIC.security },
    { from: "auditor", to: "cmklogs", label: "decrypt", color: SEMANTIC.security },
    { from: "auditor", to: "noaudit", dashed: true, color: SEMANTIC.note },
    { from: "t1", to: "t2", label: "a dial", color: SEMANTIC.platform },
    { from: "t2", to: "t3", color: SEMANTIC.platform },
    { from: "t3", to: "t4", color: SEMANTIC.platform },
    { from: "pss", to: "kyverno", color: SEMANTIC.security },
    { from: "scp", to: "tagscp", label: "target_ids = []", color: SEMANTIC.note, dashed: true },
    { from: "sso", to: "bg", dashed: true, color: SEMANTIC.security },
    { from: "cg", to: "role", label: "audits", color: SEMANTIC.security, dashed: true },
  ],
};
