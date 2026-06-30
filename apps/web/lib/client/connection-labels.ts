import type { ConnectionStatus } from "@kplay/contracts";

type ConnectionStatusValue = ConnectionStatus["status"];
type ConnectionStatusLabels = Record<ConnectionStatusValue, string>;

const defaultConnectionStatusLabels = {
  connected: "Connected",
  disconnected: "Disconnected",
  configuration_missing: "Configuration missing",
  connection_failed: "Connection failed",
  demo_mode: "Demo mode",
} satisfies ConnectionStatusLabels;

export function connectionStatusLabel(
  connection: Pick<ConnectionStatus, "status"> | null,
  options: {
    emptyLabel?: string;
    labels?: Partial<ConnectionStatusLabels>;
  } = {},
) {
  if (!connection) return options.emptyLabel ?? "Checking";
  return (
    options.labels?.[connection.status] ??
    defaultConnectionStatusLabels[connection.status]
  );
}
