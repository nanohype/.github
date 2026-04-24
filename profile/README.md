# nanohype

> Early stage — under active development

AI systems from templates to production. A growing ecosystem of tools for building, orchestrating, and deploying AI-powered software.

**[nanohype](https://github.com/nanohype/nanohype)** — Template catalog and SDK. 54 templates covering agents, RAG pipelines, MCP servers, eval harnesses, infrastructure, and composable modules. Composites wire templates into complete project architectures. A reference SDK handles validation, rendering, and orchestration.

**[protohype](https://github.com/nanohype/protohype)** — Prototyped ideas built from nanohype templates. Real, runnable applications that compose AI systems, applications, and modules into working products. See the [projects catalog](https://github.com/nanohype/protohype#projects) for the current lineup.

**[cdk-constructs](https://github.com/nanohype/cdk-constructs)** — AWS CDK constructs for building production AI systems on AWS. Opinionated, fail-secure defaults for the primitives protohype subsystems keep reaching for — pgvector-sized RDS, SQS+DLQ with depth alarms, ADOT collector sidecar, KMS envelope keys, Secrets Manager seed-and-preserve, ALB with env-driven TLS.

**[workshop](https://github.com/nanohype/workshop)** — Visual workflow builder. Graph-based pipelines where each node is a Claude Code session. Scaffold nanohype templates, chain agent review passes, and generate full workflows from composites — drag-and-drop.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/composites.svg">
  <img alt="nanohype composite stacks" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/composites.svg">
</picture>
