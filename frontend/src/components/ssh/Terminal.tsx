import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

export default function SSHTerminal({
  vmId,
  active = true,
  className = "",
  fontSize = 13,
}: {
  vmId: string;
  active?: boolean;
  className?: string;
  fontSize?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const container = ref.current;

    if (!container) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      scrollback: 1500,
      fontSize,
      theme: {
        background: "#020617",
        foreground: "#e2e8f0",
      },
    });
    terminalRef.current = term;
    term.open(container);
    term.focus();

    const fitTerminal = () => {
      const viewport = container.querySelector(".xterm-viewport") as HTMLElement | null;
      const screen = container.querySelector(".xterm-screen") as HTMLElement | null;
      const charMeasure = container.querySelector(".xterm-char-measure-element") as HTMLElement | null;

      const availableWidth = container.clientWidth - 24;
      const availableHeight = container.clientHeight - 24;
      const charWidth = charMeasure?.getBoundingClientRect().width || 8.4;
      const charHeight = charMeasure?.getBoundingClientRect().height || 17;

      if (availableWidth <= 0 || availableHeight <= 0) {
        return;
      }

      const cols = Math.max(40, Math.floor(availableWidth / Math.max(charWidth, 1)));
      const rows = Math.max(14, Math.floor(availableHeight / Math.max(charHeight, 1)));

      term.resize(cols, rows);

      if (viewport && screen) {
        viewport.style.height = `${availableHeight}px`;
        screen.style.height = `${availableHeight}px`;
      }
    };

    const ws = new WebSocket("ws://127.0.0.1:8000/ws/ssh");

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "init", vmId }));
      setTimeout(fitTerminal, 30);
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    term.onData((data) => {
      ws.send(JSON.stringify({ type: "input", data }));
    });

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });
    resizeObserver.observe(container);
    window.addEventListener("resize", fitTerminal);

    setTimeout(fitTerminal, 10);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", fitTerminal);
      ws.close();
      term.dispose();
      terminalRef.current = null;
    };
  }, [vmId]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) {
      return;
    }

    term.options.fontSize = fontSize;
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 30);

    return () => window.clearTimeout(timer);
  }, [fontSize]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const container = ref.current;

    if (!container) {
      return;
    }

    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
      container.focus?.();
    }, 30);

    return () => window.clearTimeout(timer);
  }, [active]);

  return <div ref={ref} className={`h-full min-h-[420px] w-full ${className}`} />;
}
