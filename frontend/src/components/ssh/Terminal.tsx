import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

export default function SSHTerminal({ vmId }: { vmId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new Terminal();
    term.open(ref.current!);

    const ws = new WebSocket("ws://127.0.0.1:8000/ws/ssh");

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "init", vmId }));
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    term.onData((data) => {
      ws.send(JSON.stringify({ type: "input", data }));
    });

    return () => {
      ws.close();
    };
  }, [vmId]);

  return <div ref={ref} className="h-[400px]" />;
}