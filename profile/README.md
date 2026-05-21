# nanohype

A k8s-native software factory — point it at an idea, get back production-grade software.

**[nanohype.dev →](https://nanohype.dev)**

## Repos

- **[fab](https://github.com/nanohype/fab)** — the orchestrator. A roster of Claude agents that runs an intake brief through discovery → design → build → verify → ship, gated by an evidence-backed merge review. Open-source — clone it and run your own factory.
- **[nanohype](https://github.com/nanohype/nanohype)** — templates, the `@nanohype/sdk`, and the Platform Reference: the factory's vocabulary, served to agents over MCP.
- **[protohype](https://github.com/nanohype/protohype)** — the composites: apps the factory has shipped, each running as a Platform tenant.
- **[landing-zone](https://github.com/nanohype/landing-zone)** — the cloud substrate. Multi-cloud OpenTofu + Terragrunt across AWS, GCP, and Azure.
- **[eks-agent-platform](https://github.com/nanohype/eks-agent-platform)** — the k8s-native control plane: the operator and CRDs that fence each Platform tenant.
- **[eks-gitops](https://github.com/nanohype/eks-gitops)** · **[aks-gitops](https://github.com/nanohype/aks-gitops)** — ArgoCD addon catalogs for EKS and AKS.
- **[kx](https://github.com/nanohype/kx)** — a local kind workspace mirroring the eks-gitops catalog.

## Start here

The **[Platform Reference](https://github.com/nanohype/nanohype/blob/main/docs/platform-reference.md)** is the public, agent-consumable description of the whole stack.
