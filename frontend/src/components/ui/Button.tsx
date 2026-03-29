export function Button({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
    >
      {children}
    </button>
  );
}