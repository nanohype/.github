import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * The key. Colour carries meaning on every other page, so it has to be stated
 * once somewhere — otherwise the reader has to infer the mapping from context
 * and will get it wrong on the pages where two roles sit adjacent.
 */
export const legend: Perspective = {
  id: "legend",
  name: "How to read this",
  blurb:
    "Ten views of one system. Colour means the same thing on every page; position means ownership; an arrow is reserved for the relationships position cannot express.",
  lanes: [
    [
      {
        id: "colour",
        title: "Colour is the layer",
        note: "consistent across all ten pages",
        color: SEMANTIC.note,
        cols: 3,
        nodes: [
          { id: "l-aws", label: "AWS substrate", sub: "landing-zone provisions it", color: SEMANTIC.aws },
          { id: "l-k8s", label: "Kubernetes", sub: "cluster + addon catalog", color: SEMANTIC.k8s },
          { id: "l-plat", label: "Agent platform", sub: "CRDs and reconcilers", color: SEMANTIC.platform },
          { id: "l-tenant", label: "Tenant workload", sub: "the tenant's own code", color: SEMANTIC.tenant },
          { id: "l-sec", label: "Identity & policy", sub: "IAM · KMS · admission", color: SEMANTIC.security },
          { id: "l-obs", label: "Telemetry", sub: "signals and where they go", color: SEMANTIC.telemetry },
          { id: "l-git", label: "Git & GitOps", sub: "the declared state", color: SEMANTIC.gitops },
          { id: "l-model", label: "Model plane", sub: "Bedrock and what reaches it", color: SEMANTIC.model },
          { id: "l-note", label: "Annotation", sub: "a remark, not a component", color: SEMANTIC.note },
        ],
      },
      {
        id: "grammar",
        title: "Everything else",
        note: "three conventions, and that is the whole vocabulary",
        color: SEMANTIC.note,
        cols: 1,
        nodes: [
          {
            id: "g-zone",
            label: "A dashed box is a boundary",
            sub: "namespace · account · layer",
            color: SEMANTIC.gitops,
          },
          {
            id: "g-adj",
            label: "Inside it means owned by it",
            sub: "no arrow needed to say so",
            color: SEMANTIC.gitops,
          },
          {
            id: "g-accent",
            label: "A filled box is the point",
            sub: "the two or three that matter",
            color: SEMANTIC.platform,
            accent: true,
          },
        ],
      },
    ],
    [
      {
        id: "lines",
        title: "Lines",
        note: "solid carries traffic or creates; dashed only references",
        color: SEMANTIC.note,
        cols: 2,
        nodes: [
          { id: "a1", label: "produces", sub: "solid — A creates or calls B", color: SEMANTIC.platform },
          { id: "a2", label: "the thing produced", sub: "", color: SEMANTIC.platform },
          { id: "b1", label: "reads", sub: "dashed — A refers to B", color: SEMANTIC.gitops },
          { id: "b2", label: "the thing read", sub: "", color: SEMANTIC.gitops },
        ],
      },
      {
        id: "source",
        title: "Where this comes from",
        note: "generated from the repos, not drawn by hand",
        color: SEMANTIC.gitops,
        cols: 1,
        nodes: [
          { id: "s1", label: "components from git ls-files", sub: "not from a doc that drifted", color: SEMANTIC.gitops },
          { id: "s2", label: "waves from the annotations", sub: "argocd.argoproj.io/sync-wave", color: SEMANTIC.gitops },
          { id: "s3", label: "cadences from the operator", sub: "ARCHITECTURE.md + controllers", color: SEMANTIC.gitops },
        ],
      },
    ],
  ],
  edges: [
    { from: "a1", to: "a2", label: "produces", color: SEMANTIC.platform },
    { from: "b1", to: "b2", label: "reads", color: SEMANTIC.gitops, dashed: true },
  ],
  callouts: [
    {
      lane: 0,
      title: "Why ten views and not one",
      body: "No single diagram of this system is both complete and readable. Each page answers one question and drops everything irrelevant to it, which is why the same component appears on several pages wearing different detail.",
      color: SEMANTIC.note,
    },
  ],
};
