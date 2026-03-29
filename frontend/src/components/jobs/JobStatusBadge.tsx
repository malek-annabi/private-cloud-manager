export function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SUCCEEDED: "bg-green-600",
    FAILED: "bg-red-600",
    RUNNING: "bg-yellow-500",
    PENDING: "bg-gray-500",
    HELD: "bg-purple-600",
    CANCELLED: "bg-gray-700",
  };

  return (
    <span className={`px-2 py-1 rounded text-xs ${map[status]}`}>
      {status}
    </span>
  );
}