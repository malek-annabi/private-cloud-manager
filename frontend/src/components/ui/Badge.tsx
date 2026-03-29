export function Badge({ label }: { label: string }) {
  const color =
    label === "SUCCEEDED"
      ? "bg-green-600"
      : label === "FAILED"
      ? "bg-red-600"
      : label === "RUNNING"
      ? "bg-yellow-500"
      : "bg-gray-600";

  return (
    <span className={`px-2 py-1 rounded text-xs ${color}`}>
      {label}
    </span>
  );
}