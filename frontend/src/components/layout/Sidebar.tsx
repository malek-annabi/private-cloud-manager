import { Link, useLocation } from "react-router-dom";

const items = [
  { name: "VMs", path: "/" },
  { name: "Jobs", path: "/jobs" },
  { name: "Audit", path: "/audit" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <div className="w-60 bg-gray-900 border-r border-gray-800 p-4">
      <h1 className="text-lg font-bold mb-6">
        Cloud Manager
      </h1>

      <nav className="space-y-2">
        {items.map((item) => {
          const active = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-3 py-2 rounded text-sm ${
                active
                  ? "bg-blue-600"
                  : "hover:bg-gray-800"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}