import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/soi")({
  component: () => <Navigate to="/login" />,
});
