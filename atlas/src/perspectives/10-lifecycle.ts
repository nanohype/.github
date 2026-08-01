import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * How a thing gets from an intent to running infrastructure. Two lines, one
 * layer apart: eks-fleet vends clusters, eks-agent-platform vends tenants into
 * them. Both write to git and let ArgoCD reconcile — write paths commit, read
 * paths are in-cluster watchers projecting live state back onto DB rows.
 */
export const lifecycle: Perspective = {
  id: "lifecycle",
  name: "10 · Lifecycle",
  blurb:
    "Two vending lines, one layer apart. Both write manifests to git; the cluster always wins on read.",
  lanes: [
    [
      {
        id: "intent",
        title: "Intent",
        note: "a form, a CR, or a factory run",
        color: SEMANTIC.gitops,
        cols: 3,
        nodes: [
          { id: "portalui", label: "portal form", sub: "templates · caps · RBAC", color: SEMANTIC.k8s },
          { id: "agentctl", label: "agentctl", sub: "scaffolds a Platform", color: SEMANTIC.platform },
          { id: "fabrun", label: "fab run", sub: "builds a whole tenant repo", color: SEMANTIC.platform },
        ],
      },
      {
        id: "validate",
        title: "Before anything is written",
        note: "server-side, not advisory",
        color: SEMANTIC.security,
        cols: 2,
        nodes: [
          { id: "render", label: "helm-render the chart", sub: "tenant chart, in-process", color: SEMANTIC.k8s },
          { id: "enforce", label: "budget · family · compliance", sub: "admin-set caps enforced", color: SEMANTIC.security },
          { id: "manifests", label: "validate-platform-manifests", sub: "route wire format gate", color: SEMANTIC.security },
          { id: "reject", label: "chart reject fixtures", sub: "known-bad must fail", color: SEMANTIC.security },
        ],
      },
    ],
    [
      {
        id: "git",
        title: "GitOps state",
        note: "the source of truth for what should exist",
        color: SEMANTIC.gitops,
        cols: 2,
        nodes: [
          { id: "trepo", label: "tenants repo", sub: "rendered Platform + chart", color: SEMANTIC.gitops },
          { id: "crepo", label: "clusters repo", sub: "Cluster claims", color: SEMANTIC.gitops },
          { id: "appset", label: "ApplicationSet", sub: "generators match on labels", color: SEMANTIC.gitops },
          { id: "waves", label: "sync waves", sub: "ordering is the contract", color: SEMANTIC.gitops },
        ],
      },
      {
        id: "vend",
        title: "The cluster line · eks-fleet",
        note: "hub manufactures into spoke accounts",
        color: SEMANTIC.k8s,
        cols: 1,
        nodes: [
          { id: "claim", label: "Cluster (namespaced)", sub: "Crossplane v2 — the API", color: SEMANTIC.k8s },
          { id: "comp", label: "Composition", sub: "the line", color: SEMANTIC.k8s },
          { id: "ws", label: "provider-opentofu Workspace", sub: "runs network → cluster", color: SEMANTIC.aws },
          { id: "eksout", label: "EKS + endpoint/CA/OIDC", sub: "written back to status", color: SEMANTIC.aws },
        ],
      },
    ],
    [
      {
        id: "reconcile",
        title: "The tenant line · eks-agent-platform",
        note: "ArgoCD applies; the operator reconciles what lands",
        color: SEMANTIC.platform,
        cols: 3,
        nodes: [
          { id: "argocd", label: "ArgoCD", sub: "hub → labelled spokes", color: SEMANTIC.gitops },
          { id: "platcr", label: "Platform CR", sub: "lands in the mgmt ns", color: SEMANTIC.platform },
          { id: "op", label: "operator", sub: "k8s objects + AWS state", color: SEMANTIC.platform },
          { id: "substrate", label: "tenant-substrate apply", sub: "from spec.datastores", color: SEMANTIC.aws },
          { id: "running", label: "agent pods serving", sub: "under the tenant role", color: SEMANTIC.tenant },
          { id: "ssm", label: "SSM contract", sub: "module → operator handoff", color: SEMANTIC.aws },
        ],
      },
      {
        id: "readback",
        title: "Read path",
        note: "the cluster always wins",
        color: SEMANTIC.k8s,
        cols: 1,
        nodes: [
          { id: "watcher", label: "in-cluster watchers", sub: "walk the Tenant CRs", color: SEMANTIC.k8s },
          { id: "proj", label: "DB projection", sub: "what the UI reads", color: SEMANTIC.k8s },
          { id: "feed", label: "ops feed + vend timeline", sub: "queued → active, live", color: SEMANTIC.k8s },
        ],
      },
    ],
  ],
  edges: [
    { from: "portalui", to: "render", color: SEMANTIC.k8s },
    { from: "agentctl", to: "manifests", color: SEMANTIC.platform },
    { from: "fabrun", to: "manifests", color: SEMANTIC.platform },
    { from: "render", to: "enforce", color: SEMANTIC.security },
    { from: "manifests", to: "reject", dashed: true, color: SEMANTIC.security },
    { from: "enforce", to: "trepo", label: "commits", color: SEMANTIC.gitops },
    { from: "manifests", to: "trepo", color: SEMANTIC.gitops },
    { from: "portalui", to: "crepo", label: "commits", color: SEMANTIC.gitops },
    { from: "crepo", to: "claim", color: SEMANTIC.k8s },
    { from: "claim", to: "comp", color: SEMANTIC.k8s },
    { from: "comp", to: "ws", color: SEMANTIC.aws },
    { from: "ws", to: "eksout", color: SEMANTIC.aws },
    { from: "trepo", to: "appset", color: SEMANTIC.gitops },
    { from: "appset", to: "waves", color: SEMANTIC.gitops },
    { from: "waves", to: "argocd", color: SEMANTIC.gitops },
    { from: "eksout", to: "argocd", label: "registers as a spoke", color: SEMANTIC.gitops, dashed: true },
    { from: "argocd", to: "platcr", color: SEMANTIC.platform },
    { from: "platcr", to: "op", color: SEMANTIC.platform },
    { from: "op", to: "running", color: SEMANTIC.tenant },
    { from: "substrate", to: "ssm", label: "publishes ARNs", color: SEMANTIC.aws },
    { from: "ssm", to: "op", label: "operator reads", color: SEMANTIC.aws, dashed: true },
    { from: "running", to: "watcher", color: SEMANTIC.k8s },
    { from: "watcher", to: "proj", color: SEMANTIC.k8s },
    { from: "proj", to: "feed", color: SEMANTIC.k8s },
    { from: "feed", to: "portalui", label: "read path", color: SEMANTIC.k8s, dashed: true },
  ],
};
