import { SEMANTIC, type Perspective } from "../model.ts";

/**
 * Three control loops that can each stop a tenant. The kill switch is the one
 * worth reading closely: EventBridge does not speak Kubernetes, so the switch
 * modifies AWS state and lets the operator's existing loop detect the drift —
 * loosely coupled, at the cost of one reconcile interval of lag.
 */
export const governance: Perspective = {
  id: "governance",
  name: "9 · Governance loops",
  blurb:
    "Budget, SLO, and eval each close a loop that can stop a tenant. Recovery from the budget one is exclusively human.",
  lanes: [
    [
      {
        id: "budget",
        title: "Budget → kill switch",
        note: "fires at ≥120% of monthlyUsd",
        color: SEMANTIC.aws,
        // Two columns, with the tick and the sum spanning both, so the two
        // reads sit side by side under the one that triggers them and above the
        // one that consumes them. In a three-wide row the same six nodes put a
        // box between the tick and the second thing it reads, and that edge has
        // to climb over it — the shape of the loop is what removes the detour,
        // not the router.
        cols: 2,
        nodes: [
          { id: "tick", label: "BudgetReconciler tick", sub: "1h prod · 5m dev", color: SEMANTIC.aws, wide: true },
          { id: "athena", label: "Athena CUR sum", sub: "month-to-date, by PlatformId", color: SEMANTIC.aws },
          { id: "inflight", label: "CloudWatch in-flight", sub: "last 24h estimate", color: SEMANTIC.aws },
          { id: "pct", label: "spend + in-flight → pct", sub: "written to .status", color: SEMANTIC.aws, wide: true },
          { id: "ebbus", label: "EventBridge bus", sub: "BudgetBreach event", color: SEMANTIC.aws },
          { id: "sfn", label: "Step Functions", sub: "started by an EventBridge rule", color: SEMANTIC.security },
        ],
      },
    ],
    [
      {
        id: "revoke",
        title: "What the switch does",
        note: "AWS-side only — it cannot reach the cluster",
        color: SEMANTIC.security,
        cols: 2,
        nodes: [
          { id: "detach", label: "DetachRolePolicy", sub: "the Bedrock baseline", color: SEMANTIC.security },
          { id: "tagrole", label: "TagRole suspended=true", sub: "so it is not re-attached", color: SEMANTIC.security },
        ],
      },
      {
        id: "detect",
        title: "How the cluster finds out",
        note: "drift detection, ≤60s in production",
        color: SEMANTIC.platform,
        cols: 1,
        nodes: [
          { id: "getrole", label: "PlatformReconciler GetRole", sub: "reads the tag", color: SEMANTIC.platform },
          { id: "susp", label: "phase = Suspended", sub: "+ suspendedAt · reason", color: SEMANTIC.platform },
          { id: "teardown", label: "fleet scaled to zero", sub: "Deployments + ScaledObject", color: SEMANTIC.tenant },
        ],
      },
      {
        id: "recover",
        title: "Recovery",
        note: "no CR mutation, no API path back",
        color: SEMANTIC.note,
        cols: 1,
        nodes: [
          { id: "human", label: "ops untags the role", sub: "SSO elevation · MFA · approver", color: SEMANTIC.security },
          { id: "reattach", label: "baseline re-attached", sub: "next reconcile", color: SEMANTIC.platform },
        ],
      },
    ],
    [
      {
        id: "eval",
        title: "EvalSuite → rollout gate",
        note: "a score gates a deploy",
        color: SEMANTIC.telemetry,
        cols: 2,
        // Read boustrophedon: right along the top row, down, then left along
        // the bottom. Listing them in flow order instead puts the third node
        // under the first, so the middle edge crosses the zone diagonally and
        // has to turn inside the gap between two rows.
        nodes: [
          { id: "cron", label: "Argo CronWorkflow", sub: "eval-runner template", color: SEMANTIC.gitops },
          { id: "cases", label: "golden + adversarial", sub: "injection cases too", color: SEMANTIC.telemetry },
          { id: "analysis", label: "AnalysisTemplate", sub: "Argo Rollouts gate", color: SEMANTIC.gitops },
          { id: "score", label: "status.lastScore", sub: "written back by the runner", color: SEMANTIC.telemetry },
        ],
      },
      {
        id: "slo2",
        title: "SLOPolicy → sync hold",
        note: "single-writer on the AppProject",
        color: SEMANTIC.platform,
        cols: 1,
        nodes: [
          { id: "burnrate", label: "burn rate breach", sub: "multi-window", color: SEMANTIC.telemetry },
          { id: "syncoff", label: "ArgoCD sync held", sub: "stops shipping into a fire", color: SEMANTIC.gitops },
        ],
      },
      {
        id: "alerts",
        title: "Who gets paged",
        note: "",
        color: SEMANTIC.security,
        cols: 1,
        nodes: [
          { id: "pd", label: "PagerDuty + #incidents", sub: "critical route", color: SEMANTIC.security },
          { id: "persona", label: "persona Slack channel", sub: "the team that owns it", color: SEMANTIC.telemetry },
        ],
      },
    ],
  ],
  edges: [
    { from: "tick", to: "athena", color: SEMANTIC.aws },
    { from: "tick", to: "inflight", color: SEMANTIC.aws },
    { from: "athena", to: "pct", color: SEMANTIC.aws },
    { from: "inflight", to: "pct", color: SEMANTIC.aws },
    // No labels on these two. Both join neighbours a node-gap apart, and a chip
    // does not fit in that gap — it gets pushed clear of the zone entirely and
    // reads as floating text belonging to nothing. The threshold is in the zone
    // note and the trigger is on the node itself, so neither is lost.
    { from: "pct", to: "ebbus", color: SEMANTIC.aws },
    { from: "ebbus", to: "sfn", color: SEMANTIC.security },
    { from: "sfn", to: "detach", color: SEMANTIC.security },
    { from: "sfn", to: "tagrole", color: SEMANTIC.security },
    { from: "tagrole", to: "getrole", label: "detected as drift", color: SEMANTIC.platform },
    { from: "getrole", to: "susp", color: SEMANTIC.platform },
    { from: "susp", to: "teardown", color: SEMANTIC.tenant },
    { from: "susp", to: "pd", color: SEMANTIC.security },
    { from: "human", to: "reattach", color: SEMANTIC.platform },
    { from: "teardown", to: "human", label: "the only way back", color: SEMANTIC.note, dashed: true },
    { from: "cron", to: "cases", color: SEMANTIC.telemetry },
    { from: "cases", to: "score", color: SEMANTIC.telemetry },
    { from: "score", to: "analysis", color: SEMANTIC.gitops },
    { from: "burnrate", to: "syncoff", color: SEMANTIC.gitops },
    { from: "burnrate", to: "persona", color: SEMANTIC.telemetry },
  ],
  callouts: [
    {
      lane: 0,
      title: "Why the switch takes the long way",
      body: "EventBridge cannot call a Kubernetes API, so the switch only changes AWS state and the operator's existing loop picks the change up as drift. Nothing new is coupled to the cluster; the price is one reconcile interval of lag.",
      color: SEMANTIC.note,
    },
  ],
};
