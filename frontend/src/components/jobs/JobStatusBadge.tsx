import { Badge } from "../ui/Badge";

export function JobStatusBadge({ status }: { status: string }) {
  const tones: Record<string, "success" | "danger" | "warning" | "neutral" | "info"> = {
    SUCCEEDED: "success",
    FAILED: "danger",
    RUNNING: "warning",
    PENDING: "neutral",
    HELD: "info",
    CANCELLED: "neutral",
  };

  return <Badge label={status} tone={tones[status] ?? "neutral"} />;
}
