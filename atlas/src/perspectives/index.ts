import type { Perspective } from "../model.ts";
import { legend } from "./00-legend.ts";
import { org } from "./01-org.ts";
import { substrate } from "./02-substrate.ts";
import { network } from "./03-network.ts";
import { addons } from "./04-addons.ts";
import { controlPlane } from "./05-control-plane.ts";
import { requestPath } from "./06-request-path.ts";
import { identity } from "./07-identity.ts";
import { observability } from "./08-observability.ts";
import { governance } from "./09-governance.ts";
import { lifecycle } from "./10-lifecycle.ts";

export const PERSPECTIVES: Perspective[] = [
  legend,
  org,
  substrate,
  network,
  addons,
  controlPlane,
  requestPath,
  identity,
  observability,
  governance,
  lifecycle,
];
