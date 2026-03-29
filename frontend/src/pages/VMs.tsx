import { useVMs } from "../hooks/useVMs";
import { Button } from "../components/ui/Button";
import { startVM, stopVM, sshExec } from "../api/jobs";
import { useState } from "react";
import SSHTerminal from "../components/ssh/Terminal";

export default function VMs() {
  const { data, isLoading } = useVMs();

  const [command, setCommand] = useState("");
  const [selectedVm, setSelectedVm] = useState<string | null>(null);

  if (isLoading) return <div>Loading...</div>;

  const runSSH = async () => {
    if (!selectedVm || !command) return;

    await sshExec(selectedVm, command);
    setCommand("");
  };

  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">VM Inventory</h1>

      <table className="w-full text-sm mb-6">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {data.map((vm: any) => (
            <tr key={vm.id}>
              <td>{vm.name}</td>
              <td>{vm.type}</td>

              <td className="space-x-2">
                <Button onClick={() => startVM(vm.id)}>
                  Start
                </Button>

                <Button onClick={() => stopVM(vm.id)}>
                  Stop
                </Button>

                <Button onClick={() => setSelectedVm(vm.id)}>
                  SSH
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* SSH PANEL */}
       {selectedVm && (
      <div className="border border-gray-800 rounded p-4">
        <div className="flex justify-between mb-2">
          <h2 className="text-sm">
            SSH Session — {selectedVm}
          </h2>

          <Button onClick={() => setSelectedVm(null)}>
            Close
          </Button>
        </div>

        <SSHTerminal vmId={selectedVm} />
      </div>
    )}
  </div>
  );
}