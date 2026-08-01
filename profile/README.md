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

### The architecture

<sub>Colour means the same thing on every page · containment means ownership · an arrow is spent only where position cannot say it<br />
Generated from the repos themselves — components from <code>git ls-files</code>, sync waves from the ApplicationSet annotations, cadences from the operator.</sub>

</div>

<details>
<summary><b>How to read this</b>&nbsp;&nbsp;<sub>what each colour means, what containment means, and when an arrow is worth spending</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/00-legend-light.svg"><img alt="How to read this — colour, containment, and when an arrow is spent" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/00-legend-light.svg" width="920"></a>
</details>

<details open>
<summary><b>1 · The factory</b>&nbsp;&nbsp;<sub>every repo is what the factory consumes, what it produces, or the factory itself</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/01-org-light.svg"><img alt="The factory — every repo is what the factory consumes, what it produces, or the factory itself" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/01-org-light.svg" width="920"></a>
</details>

<details>
<summary><b>2 · Cloud substrate</b>&nbsp;&nbsp;<sub>landing-zone by layer — organization components run once, everything below them is per-environment</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/02-substrate-light.svg"><img alt="Cloud substrate — landing-zone by layer" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/02-substrate-light.svg" width="920"></a>
</details>

<details>
<summary><b>3 · Network</b>&nbsp;&nbsp;<sub>one component, two modes — own a VPC, or build nothing and re-export someone else's</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/03-network-light.svg"><img alt="Network — one component, two modes: create a VPC or adopt an existing one" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/03-network-light.svg" width="920"></a>
</details>

<details>
<summary><b>4 · Cluster addons</b>&nbsp;&nbsp;<sub>one ApplicationSet per group, ordered by sync wave — a cluster opts in with a label</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/04-addons-light.svg"><img alt="Cluster addons — one ApplicationSet per group, ordered by sync wave" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/04-addons-light.svg" width="920"></a>
</details>

<details>
<summary><b>5 · Control plane</b>&nbsp;&nbsp;<sub>ten CRDs, nine reconcilers, one binary — each zone is a reconciler, and what sits in it is what that reconciler keeps true</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/05-control-plane-light.svg"><img alt="Control plane — ten CRDs, nine reconcilers, one binary" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/05-control-plane-light.svg" width="920"></a>
</details>

<details>
<summary><b>6 · Request path</b>&nbsp;&nbsp;<sub>one invocation, app to model and back — the app holds no AWS credential and signs nothing</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/06-request-path-light.svg"><img alt="Request path — one invocation, app to model and back" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/06-request-path-light.svg" width="920"></a>
</details>

<details>
<summary><b>7 · Identity &amp; isolation</b>&nbsp;&nbsp;<sub>isolation is a spectrum, not a boolean — two orthogonal dials</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/07-identity-light.svg"><img alt="Identity and isolation — two orthogonal dials, not one boolean" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/07-identity-light.svg" width="920"></a>
</details>

<details>
<summary><b>8 · Observability</b>&nbsp;&nbsp;<sub>one neutral OTLP waist — which backends exist behind it is a property of the cluster tier</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/08-observability-light.svg"><img alt="Observability — one neutral OTLP waist, backends behind it set by cluster tier" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/08-observability-light.svg" width="920"></a>
</details>

<details>
<summary><b>9 · Governance loops</b>&nbsp;&nbsp;<sub>budget, SLO and eval each close a loop that can stop a tenant — recovery from the budget one is human</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/09-governance-light.svg"><img alt="Governance loops — budget, SLO and eval each close a loop that can stop a tenant" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/09-governance-light.svg" width="920"></a>
</details>

<details>
<summary><b>10 · Lifecycle</b>&nbsp;&nbsp;<sub>two vending lines, one layer apart — both write manifests to git, and the cluster always wins on read</sub></summary>
<br />
<a href="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/10-lifecycle-light.svg"><img alt="Lifecycle — two vending lines, one layer apart" src="https://raw.githubusercontent.com/nanohype/.github/main/profile/assets/atlas/10-lifecycle-light.svg" width="920"></a>
</details>

<div align="center">

<sub>How they are built, and the rules they follow → <a href="https://github.com/nanohype/.github/tree/main/atlas"><b>atlas/</b></a></sub>

</div>

<div align="center">
  <sub>Deploy it on your AWS&nbsp;→&nbsp;<a href="https://nanohype.dev"><b>nanohype.dev</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;Run it yourself&nbsp;→&nbsp;<a href="https://github.com/nanohype/nanohype/blob/main/docs/platform-reference.md"><b>Platform Reference</b></a>&nbsp;·&nbsp;<a href="https://github.com/nanohype/.github/blob/main/profile/ROADMAP.md">Roadmap</a></sub>
</div>
