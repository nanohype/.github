import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * The create/adopt idiom. Both modes expose the identical output interface, so
 * a consuming `cluster` wires against one contract regardless of who owns the
 * VPC — that equivalence is the whole point of the layer and the thing this
 * page has to make visible.
 */
export const network: Perspective = {
  id: "network",
  name: "3 · Network",
  blurb:
    "One component, two modes. In create mode it owns a VPC; in adopt mode it builds nothing and re-exports someone else's through the same outputs.",
  lanes: [
    [
      {
        id: "orgnet",
        title: "org-networking",
        note: "management account — the address space and the backbone",
        color: SEMANTIC.aws,
        cols: 3,
        nodes: [
          { id: "ipam", label: "IPAM top pool", sub: "per-env sub-pools, tag-discovered", color: SEMANTIC.aws },
          { id: "tgw", label: "Transit Gateway", sub: "RAM-shared to workload accts", color: SEMANTIC.aws },
          { id: "tgwrt", label: "TGW route tables", sub: "0.0.0.0/0 owned here only", color: SEMANTIC.aws },
        ],
      },
    ],
    [
      {
        id: "create",
        title: "create mode",
        note: "the single-account default — this component owns the VPC",
        color: SEMANTIC.aws,
        cols: 2,
        nodes: [
          { id: "vpc", label: "VPC", sub: "literal CIDR or IPAM-drawn", color: SEMANTIC.aws },
          { id: "subnets", label: "public + private subnets", sub: "one per AZ · cidrsubnet(+8)", color: SEMANTIC.aws },
          { id: "nat", label: "NAT gateways", sub: "1 shared, or one per AZ", color: SEMANTIC.aws },
          { id: "flow", label: "VPC flow logs", sub: "staging + production", color: SEMANTIC.telemetry },
          { id: "s3gw", label: "S3 gateway endpoint", sub: "free · default ON", color: SEMANTIC.aws },
          { id: "ifep", label: "interface endpoints", sub: "paid · default OFF", color: SEMANTIC.aws },
        ],
      },
      {
        id: "adopt",
        title: "adopt mode",
        note: "builds nothing — resolves and re-exports",
        color: SEMANTIC.gitops,
        cols: 1,
        nodes: [
          { id: "resolve", label: "resolve existing VPC", sub: "same-acct or RAM-shared", color: SEMANTIC.gitops },
          { id: "preflight", label: "consumer preflight", sub: "fails at plan, not at apply", color: SEMANTIC.security },
          { id: "notags", label: "stamp_subnet_tags = false", sub: "a participant cannot tag", color: SEMANTIC.gitops },
        ],
      },
      {
        id: "owner",
        title: "shared-network",
        note: "network-owner account — the far side of adopt",
        color: SEMANTIC.aws,
        cols: 1,
        nodes: [
          { id: "ownervpc", label: "shared VPC", sub: "IPAM-drawn, one per env", color: SEMANTIC.aws },
          { id: "ownerep", label: "owner-run endpoints", sub: "same set as create mode", color: SEMANTIC.aws },
          { id: "ram", label: "RAM share", sub: "subnets → consumer accts", color: SEMANTIC.aws },
        ],
      },
    ],
    [
      {
        id: "egress",
        title: "egress-network",
        note: "one hub per transit gateway — every environment shares its NAT IPs",
        color: SEMANTIC.aws,
        cols: 3,
        nodes: [
          { id: "hubvpc", label: "hub VPC", sub: "dedicated CIDR", color: SEMANTIC.aws },
          { id: "hubnat", label: "hub NAT", sub: "terminates spoke egress", color: SEMANTIC.aws },
          { id: "attach", label: "TGW attachment", sub: "publishes attachment id", color: SEMANTIC.aws },
        ],
      },
      {
        id: "consumer",
        title: "The cluster that lands on it",
        note: "wires against one output contract either way",
        color: SEMANTIC.k8s,
        cols: 2,
        nodes: [
          { id: "eks", label: "EKS control plane", sub: "private endpoint", color: SEMANTIC.k8s },
          { id: "karpenter", label: "Karpenter", sub: "discovers by subnet tag", color: SEMANTIC.k8s },
          { id: "cilium", label: "Cilium CNI", sub: "eBPF dataplane + policy", color: SEMANTIC.k8s },
          { id: "alb", label: "AWS LB Controller", sub: "reads ELB role tags", color: SEMANTIC.k8s },
        ],
      },
    ],
  ],
  edges: [
    { from: "ipam", to: "vpc", label: "sub-pool", color: SEMANTIC.aws, dashed: true },
    { from: "ipam", to: "ownervpc", color: SEMANTIC.aws, dashed: true },
    { from: "vpc", to: "subnets", color: SEMANTIC.aws },
    { from: "subnets", to: "nat", color: SEMANTIC.aws },
    { from: "ownervpc", to: "ram", color: SEMANTIC.aws },
    { from: "ram", to: "resolve", label: "cross-account", color: SEMANTIC.aws },
    { from: "ownerep", to: "resolve", dashed: true, color: SEMANTIC.aws },
    { from: "resolve", to: "preflight", color: SEMANTIC.security },
    { from: "preflight", to: "notags", color: SEMANTIC.gitops },
    { from: "nat", to: "attach", label: "centralized_egress", color: SEMANTIC.aws, dashed: true },
    { from: "tgw", to: "attach", color: SEMANTIC.aws },
    { from: "attach", to: "hubnat", color: SEMANTIC.aws },
    { from: "hubvpc", to: "hubnat", color: SEMANTIC.aws },
    { from: "tgwrt", to: "attach", label: "static route", color: SEMANTIC.aws, dashed: true },
    { from: "subnets", to: "eks", label: "subnet ids", color: SEMANTIC.k8s },
    { from: "notags", to: "karpenter", label: "no discovery tag", color: SEMANTIC.security, dashed: true },
    { from: "s3gw", to: "eks", label: "ECR stays in-VPC", color: SEMANTIC.aws, dashed: true },
    { from: "eks", to: "cilium", color: SEMANTIC.k8s },
    { from: "eks", to: "alb", color: SEMANTIC.k8s },
  ],
};
