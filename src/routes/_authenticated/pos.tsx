import { createFileRoute } from "@tanstack/react-router";
import { PosClient } from "./-pos/PosClient";

export const Route = createFileRoute("/_authenticated/pos")({
  component: PosClient,
});
