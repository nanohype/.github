import { SEMANTIC, type Perspective } from "../model.ts";

export const org: Perspective = {
  id: "org",
  name: "1 · The factory",
  blurb:
    "Every repo plays one of three roles: what the factory consumes, what it produces, or the factory itself. The deploy substrate sits between them.",
  lanes: [
    [
      {
        id: "factory",
        title: "The factory",
        note: "orchestrates the work",
        color: SEMANTIC.platform,
        nodes: [
          {
            id: "fab",
            label: "fab",
            sub: "80-role roster · 4 transports",
            color: SEMANTIC.platform,
          },
        ],
      },
      {
        id: "context",
        title: "Factory context",
        note: "the vocabulary the factory designs against",
        color: SEMANTIC.gitops,
        cols: 3,
        nodes: [
          {
            id: "nanohype",
            label: "nanohype",
            sub: "templates · composites · SDK",
            color: SEMANTIC.gitops,
          },
          {
            id: "standards",
            label: "standards/*.json",
            sub: "the published bar",
            color: SEMANTIC.gitops,
          },
          {
            id: "docs",
            label: "docs",
            sub: "Starlight front door",
            color: SEMANTIC.gitops,
          },
        ],
      },
    ],
    [
      {
        id: "substrate",
        title: "Deploy substrate",
        note: "slow-moving cloud + cluster layers — shared by every tenant",
        color: SEMANTIC.aws,
        cols: 4,
        nodes: [
          {
            id: "landing-zone",
            label: "landing-zone",
            sub: "37 OpenTofu components",
            color: SEMANTIC.aws,
          },
          {
            id: "eks-fleet",
            label: "eks-fleet",
            sub: "vends clusters (Crossplane)",
            color: SEMANTIC.k8s,
          },
          {
            id: "eks-gitops",
            label: "eks-gitops",
            sub: "ArgoCD addon catalog",
            color: SEMANTIC.k8s,
          },
          {
            id: "eap",
            label: "eks-agent-platform",
            sub: "tenant control plane",
            color: SEMANTIC.platform,
          },
          {
            id: "portal",
            label: "portal",
            sub: "ops UI + one audit trail",
            color: SEMANTIC.k8s,
          },
          {
            id: "cloudgov",
            label: "cloudgov",
            sub: "IAM · cost · posture · drift",
            color: SEMANTIC.security,
          },
          {
            id: "kx",
            label: "kx",
            sub: "local replica of eks-gitops",
            color: SEMANTIC.gitops,
          },
          {
            id: "tap",
            label: "homebrew-tap",
            sub: "publishes the CLIs",
            color: SEMANTIC.gitops,
          },
        ],
      },
    ],
    [
      {
        id: "output",
        title: "Factory output",
        note: "standalone repos, each a Helm chart + a Platform CR",
        color: SEMANTIC.tenant,
        cols: 4,
        nodes: [
          {
            id: "ci",
            label: "competitive-intelligence",
            sub: "crawl · semantic diff · alert",
            color: SEMANTIC.tenant,
          },
          {
            id: "dp",
            label: "digest-pipeline",
            sub: "aggregate · draft · gated send",
            color: SEMANTIC.tenant,
          },
          {
            id: "ir",
            label: "incident-response",
            sub: "war room · gated publish",
            color: SEMANTIC.tenant,
          },
          {
            id: "skb",
            label: "slack-knowledge-bot",
            sub: "ACL-filtered retrieval",
            color: SEMANTIC.tenant,
          },
        ],
      },
      {
        id: "state",
        title: "GitOps state",
        note: "private · portal-written",
        color: SEMANTIC.gitops,
        cols: 1,
        nodes: [
          {
            id: "tenants-repo",
            label: "tenants",
            sub: "rendered tenant manifests",
            color: SEMANTIC.gitops,
          },
          {
            id: "clusters-repo",
            label: "clusters",
            sub: "Cluster claims",
            color: SEMANTIC.gitops,
          },
        ],
      },
    ],
  ],
  edges: [
    { from: "nanohype", to: "fab", label: "vocabulary", dashed: true },
    { from: "standards", to: "fab", label: "the bar", dashed: true },
    { from: "fab", to: "ci", label: "builds", color: SEMANTIC.platform },
    { from: "fab", to: "dp", color: SEMANTIC.platform },
    { from: "fab", to: "ir", color: SEMANTIC.platform },
    { from: "fab", to: "skb", color: SEMANTIC.platform },
    { from: "landing-zone", to: "eks-fleet", label: "wrapped by", color: SEMANTIC.aws },
    { from: "eks-fleet", to: "clusters-repo", label: "reads claims", dashed: true },
    { from: "eks-gitops", to: "eap", label: "installs", color: SEMANTIC.k8s },
    // Both leave portal from the same point so they read as one relationship
    // that forks, rather than two facts that happen to share a source. The
    // router's reuse penalty separates them once they are clear of the box.
    {
      from: "portal",
      to: "tenants-repo",
      label: "commits",
      color: SEMANTIC.gitops,
      fromAnchor: { x: 1, y: 0.5 },
    },
    { from: "portal", to: "clusters-repo", color: SEMANTIC.gitops, fromAnchor: { x: 1, y: 0.5 } },
    { from: "tenants-repo", to: "ci", label: "ApplicationSet", dashed: true },
    { from: "eks-gitops", to: "kx", label: "replicated locally", dashed: true, color: SEMANTIC.gitops },
  ],
};
