import { useEffect, useRef, useState } from "react";
import { wsUrl as getWsUrl } from "@/lib/api-url";

export type SatomiWsEvent =
  | { type: "trigger"; username: string; message: string; timestamp: number }
  | { type: "response"; username: string; question: string; response: string; gesture?: string; timestamp: number }
  | { type: "status"; connected: boolean; tokenAddress: string };

export interface SatomiPair {
  username: string;
  message: string;
  response?: string;
  timestamp: number;
}

export function useSatomiWs(onEvent?: (event: SatomiWsEvent) => void) {
  const [status, setStatus] = useState<{ connected: boolean; tokenAddress: string; wsOpen: boolean }>({
    connected: false,
    tokenAddress: "",
    wsOpen: false,
  });
  const [pairs, setPairs] = useState<SatomiPair[]>([]);

  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const wsUrl = getWsUrl();

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("Satomi WS Connected");
          setStatus((prev) => ({ ...prev, wsOpen: true }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string) as SatomiWsEvent;
            if (onEventRef.current) onEventRef.current(data);

            if (data.type === "status") {
              setStatus({ connected: data.connected, tokenAddress: data.tokenAddress });
            } else if (data.type === "trigger") {
              setPairs((prev) => {
                const updated: SatomiPair[] = [
                  ...prev,
                  { username: data.username, message: data.message, timestamp: data.timestamp },
                ];
                return updated.length > 5 ? updated.slice(updated.length - 5) : updated;
              });
            } else if (data.type === "response") {
              setPairs((prev) => {
                const idx = [...prev].reverse().findIndex(
                  (p) => p.username === data.username && !p.response,
                );
                if (idx === -1) {
                  const newPair: SatomiPair = {
                    username: data.username,
                    message: data.question,
                    response: data.response,
                    timestamp: data.timestamp,
                  };
                  const updated = [...prev, newPair];
                  return updated.length > 5 ? updated.slice(updated.length - 5) : updated;
                }
                const realIdx = prev.length - 1 - idx;
                const updated = prev.map((p, i) =>
                  i === realIdx ? { ...p, response: data.response } : p,
                );
                return updated.length > 5 ? updated.slice(updated.length - 5) : updated;
              });
            }
          } catch (e) {
            console.error("Failed to parse WS message", e);
          }
        };

        ws.onclose = () => {
          console.log("Satomi WS Disconnected");
          setStatus((prev) => ({ ...prev, connected: false, wsOpen: false }));
          if (!stopped) {
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          console.error("Satomi WS Error");
        };
      } catch (e) {
        console.error("Failed to connect to WS", e);
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  return { status, pairs };
}
