<div align="center">

<img alt="nanohype — agent factory. A production agent platform, deployed on your AWS." src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/hero.svg" width="840">

<p>
  <b>A production agent platform, deployed on your AWS.</b><br />
  The Kubernetes-native substrate, the guardrails, and a first production app — stood up on your
  account and explained end to end, not handed over as a repo to reverse-engineer.<br />
  Or run the whole factory yourself; it's all open source.
</p>

<p>
  <a href="https://nanohype.dev"><img alt="nanohype.dev" src="https://img.shields.io/badge/nanohype.dev-3b82f6?style=flat-square&logoColor=white"></a>
  <img alt="Kubernetes-native" src="https://img.shields.io/badge/Kubernetes--native-06b6d4?style=flat-square&logo=kubernetes&logoColor=white">
  <img alt="OpenTofu" src="https://img.shields.io/badge/OpenTofu-3b82f6?style=flat-square&logo=opentofu&logoColor=white">
  <img alt="Argo CD" src="https://img.shields.io/badge/Argo%20CD-60a5fa?style=flat-square&logo=argo&logoColor=white">
  <img alt="Bedrock + Claude" src="https://img.shields.io/badge/Bedrock%20%2B%20Claude-0a0f1e?style=flat-square&logo=anthropic&logoColor=white">
</p>

</div>

<table>
  <tr><td colspan="2"><sub><b>THE FACTORY</b></sub></td></tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/fab"><b>fab</b></a></td>
    <td>The factory runner — orchestrates a roster of Claude agents through discovery&nbsp;→&nbsp;design&nbsp;→&nbsp;build&nbsp;→&nbsp;verify&nbsp;→&nbsp;ship, every deliverable gated by an evidence-backed merge review.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/nanohype"><b>nanohype</b></a></td>
    <td>Template catalog + <code>@nanohype/sdk</code> + the Platform Reference — the factory's vocabulary, served to agents over MCP.</td>
  </tr>

  <tr><td colspan="2"><sub><b>THE SUBSTRATE&nbsp;·&nbsp;what it ships onto</b></sub></td></tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/landing-zone"><b>landing-zone</b></a></td>
    <td>The AWS substrate — OpenTofu + Terragrunt monorepo, multi-account isolation, GitOps-ready clusters.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/eks-fleet"><b>eks-fleet</b></a></td>
    <td>The cluster vending machine — a Crossplane v2 composition that manufactures EKS clusters from a namespaced <code>Cluster</code> resource, wrapping the landing-zone modules.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/eks-agent-platform"><b>eks-agent-platform</b></a></td>
    <td>k8s-native control plane: the operator + CRDs that fence each Platform tenant — per-tenant IAM/KMS/S3, an Envoy AI Gateway egress path, KEDA autoscaling, a budget kill-switch, and an Argo eval pipeline on EKS + Bedrock.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/eks-gitops"><b>eks-gitops</b></a></td>
    <td>ArgoCD addon catalog for EKS — ApplicationSets, sync-wave ordering, per-env Helm values.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/kx"><b>kx</b></a></td>
    <td>Local kind cluster preloaded with the eks-gitops catalog — develop locally, deploy to EKS unchanged.</td>
  </tr>

  <tr><td colspan="2"><sub><b>WHAT IT'S SHIPPED&nbsp;·&nbsp;live Platform tenants</b></sub></td></tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/competitive-intelligence"><b>competitive-intelligence</b></a></td>
    <td>Competitor-site change radar — crawls, semantic-diffs each page, alerts Slack on meaningful change. Durable pgvector.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/incident-response"><b>incident-response</b></a></td>
    <td>Ceremonial incident commander — Grafana OnCall&nbsp;→&nbsp;war-room&nbsp;→&nbsp;approval-gated Statuspage&nbsp;→&nbsp;Linear postmortem.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/digest-pipeline"><b>digest-pipeline</b></a></td>
    <td>Weekly newsletter pipeline — aggregates GitHub/Linear/Notion/Slack, drafts with Bedrock Claude, human-gated SES send.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/slack-knowledge-bot"><b>slack-knowledge-bot</b></a></td>
    <td>Internal Slack knowledge bot — per-user ACL-filtered retrieval over Notion/Confluence/Drive via Bedrock Claude.</td>
  </tr>

  <tr><td colspan="2"><sub><b>OPERATE</b></sub></td></tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/portal"><b>portal</b></a></td>
    <td>Self-hosted ops portal for OpenTofu workspaces, AWS accounts, EKS clusters, and EAP tenants — one UI, one audit trail.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/cloudgov"><b>cloudgov</b></a></td>
    <td>AWS security &amp; cost CLI — IAM least-privilege, cost anomalies, posture, drift, plus a Kubernetes RBAC scanner.</td>
  </tr>
  <tr>
    <td valign="top"><a href="https://github.com/nanohype/homebrew-tap"><b>homebrew-tap</b></a></td>
    <td><code>brew install</code> for the nanohype CLIs.</td>
  </tr>
</table>

<div align="center">

### The architecture, in eleven views

<sub>Colour means the same thing on every page · containment means ownership · an arrow is spent only where position cannot say it<br />
Generated from the repos themselves — components from <code>git ls-files</code>, sync waves from the ApplicationSet annotations, cadences from the operator.</sub>

<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/01-org-dark.svg">
  <img alt="Every repo plays one of three roles" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/01-org-light.svg" width="900">
</picture>

<sub><b>The factory.</b> What it consumes, what it produces, and the deploy substrate in between.</sub>

<br /><br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/06-request-path-dark.svg">
  <img alt="One invocation, app to model and back" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/06-request-path-light.svg" width="900">
</picture>

<sub><b>The request path.</b> The app holds no AWS credential and signs nothing — the gateway does, as the tenant.</sub>

<br /><br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/05-control-plane-dark.svg">
  <img alt="Ten CRDs, nine reconcilers, one binary" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/05-control-plane-light.svg" width="900">
</picture>

<sub><b>The control plane.</b> Each zone is a reconciler; what sits inside it is what that reconciler creates and keeps true.</sub>

<br /><br />


<table>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/00-legend-light.svg"><b>How to read this</b></a></td><td><sub>the conventions — colour, containment, lines</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/01-org-light.svg"><b>The factory</b></a></td><td><sub>every repo's role: consumed, produced, or the factory itself</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/02-substrate-light.svg"><b>Cloud substrate</b></a></td><td><sub>37 OpenTofu components, by layer</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/03-network-light.svg"><b>Network</b></a></td><td><sub>one component, two modes — own a VPC or adopt one</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/04-addons-light.svg"><b>Cluster addons</b></a></td><td><sub>the ArgoCD catalog, ordered by sync wave</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/05-control-plane-light.svg"><b>Control plane</b></a></td><td><sub>ten CRDs, nine reconcilers, one binary</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/06-request-path-light.svg"><b>Request path</b></a></td><td><sub>one invocation, app to model and back</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/07-identity-light.svg"><b>Identity &amp; isolation</b></a></td><td><sub>who can reach what, and the tiers that bound it</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/08-observability-light.svg"><b>Observability</b></a></td><td><sub>one OTLP waist, two backend tiers</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/09-governance-light.svg"><b>Governance loops</b></a></td><td><sub>budget, SLO and eval — each can stop a tenant</sub></td></tr>
  <tr><td><a href="https://github.com/nanohype/.github/blob/main/profile/assets/atlas/10-lifecycle-light.svg"><b>Lifecycle</b></a></td><td><sub>intent → git → reconciled infrastructure</sub></td></tr>
</table>

<sub>How they are built, and the rules they follow → <a href="https://github.com/nanohype/.github/tree/main/atlas"><b>atlas/</b></a></sub>

</div>

<div align="center">
  <sub>Deploy it on your AWS&nbsp;→&nbsp;<a href="https://nanohype.dev"><b>nanohype.dev</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;Run it yourself&nbsp;→&nbsp;<a href="https://github.com/nanohype/nanohype/blob/main/docs/platform-reference.md"><b>Platform Reference</b></a>&nbsp;·&nbsp;<a href="https://github.com/nanohype/.github/blob/main/profile/ROADMAP.md">Roadmap</a></sub>
</div>
