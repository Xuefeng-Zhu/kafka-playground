"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  ConnectionStatus,
  RemoteKafkaConfig,
  ScenarioDefinition,
  UserSelectableKafkaMode,
} from "@kplay/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/client/cn";

const REMOTE_CONFIG_STORAGE_KEY = "kplay.remoteKafka.config";

const defaultRemoteKafkaConfig: RemoteKafkaConfig = {
  brokers: "",
  username: "",
  password: "",
  saslMechanism: "SCRAM-SHA-256",
  useTls: true,
  caCertificate: "",
};

export function StartRunPanel({
  connection,
  disabled,
  onStartRun,
  onTestRemoteConnection,
  scenario,
}: {
  connection: ConnectionStatus | null;
  disabled: boolean;
  onStartRun: (input: {
    mode: UserSelectableKafkaMode;
    remoteKafkaConfig?: RemoteKafkaConfig;
  }) => void;
  onTestRemoteConnection: (
    remoteKafkaConfig: RemoteKafkaConfig,
  ) => Promise<ConnectionStatus>;
  scenario: ScenarioDefinition | null;
}) {
  const [mode, setMode] = useState<UserSelectableKafkaMode>("demo");
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [remoteConfig, setRemoteConfig] = useState(defaultRemoteKafkaConfig);
  const [remoteConnection, setRemoteConnection] =
    useState<ConnectionStatus | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [isTestingRemote, setTestingRemote] = useState(false);
  const missingRemoteFields = requiredRemoteFields(remoteConfig);
  const isRemoteMode = mode === "remote";
  const isStartDisabled =
    disabled || !scenario || (isRemoteMode && missingRemoteFields.length > 0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRemoteConfig(loadSavedRemoteConfig());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function selectMode(nextMode: UserSelectableKafkaMode) {
    setMode(nextMode);
    if (nextMode === "remote") setDrawerOpen(true);
  }

  function updateRemoteConfig(nextConfig: RemoteKafkaConfig) {
    setRemoteConfig(nextConfig);
    setRemoteConnection(null);
    setRemoteError(null);
    window.localStorage.setItem(
      REMOTE_CONFIG_STORAGE_KEY,
      JSON.stringify(nextConfig),
    );
  }

  async function testRemoteConnection() {
    setTestingRemote(true);
    setRemoteError(null);
    try {
      setRemoteConnection(await onTestRemoteConnection(remoteConfig));
    } catch (error) {
      setRemoteConnection(null);
      setRemoteError(
        error instanceof Error
          ? error.message
          : "Unable to test the remote connection.",
      );
    } finally {
      setTestingRemote(false);
    }
  }

  function clearRemoteConfig() {
    setRemoteConfig(defaultRemoteKafkaConfig);
    setRemoteConnection(null);
    setRemoteError(null);
    window.localStorage.removeItem(REMOTE_CONFIG_STORAGE_KEY);
  }

  return (
    <div className="kplay-grid-bg flex h-full items-center justify-center p-10">
      <div className="max-w-2xl rounded-3xl border-[3px] border-teal-700 bg-[#fffdf5] p-8 shadow-[12px_12px_0_rgba(15,118,110,0.22)]">
        <h2 className="text-2xl font-extrabold text-[#123047]">
          Start a scenario run
        </h2>
        {scenario ? (
          <div className="mt-4 text-left">
            <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.22em] text-teal-700">
              Selected scenario
            </div>
            <h3 className="mt-1 text-xl font-extrabold text-[#123047]">
              {scenario.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#466778]">
              {scenario.description}
            </p>
            <div className="mt-4 rounded-2xl border-[3px] border-teal-700 bg-teal-50 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-teal-800">
                <span>{scenario.topic.partitions} partitions</span>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-5 text-[#31566a]">
                {scenario.learningObjectives.map((objective) => (
                  <li key={objective} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500"
                    />
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-center text-sm leading-6 text-[#466778]">
            Loading scenario details.
          </p>
        )}
        <div
          aria-label="Runtime mode"
          className="mt-5 grid rounded-2xl border-[3px] border-teal-700 bg-[#fff7ed] p-1 sm:grid-cols-2"
          role="tablist"
        >
          <ModeButton
            active={mode === "demo"}
            label="Demo"
            onClick={() => selectMode("demo")}
            status={connectionLabel(connection)}
          />
          <ModeButton
            active={mode === "remote"}
            label="Remote Kafka"
            onClick={() => selectMode("remote")}
            status={remoteStatusLabel(remoteConnection, missingRemoteFields)}
          />
        </div>
        {isRemoteMode && missingRemoteFields.length > 0 && (
          <div className="mt-4 rounded-2xl border-[3px] border-amber-500 bg-amber-100 p-3 text-left text-sm text-amber-900 shadow-[7px_7px_0_rgba(245,158,11,0.18)]">
            <div className="font-extrabold">Remote configuration required</div>
            <p className="mt-1 text-amber-900/80">
              Add {missingRemoteFields.join(", ")} before starting a remote run.
            </p>
          </div>
        )}
        {isRemoteMode && remoteConnection?.status === "connection_failed" && (
          <ConnectionNotice connection={remoteConnection} />
        )}
        <Button
          className="mx-auto mt-6 flex"
          variant="primary"
          onClick={() =>
            onStartRun({
              mode,
              remoteKafkaConfig: isRemoteMode ? remoteConfig : undefined,
            })
          }
          disabled={isStartDisabled}
        >
          Start scenario run
        </Button>
        {isRemoteMode && (
          <Button
            className="mx-auto mt-3 flex"
            variant="ghost"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            Configure remote connection
          </Button>
        )}
      </div>
      {isDrawerOpen && (
        <RemoteConfigDrawer
          config={remoteConfig}
          connection={remoteConnection}
          error={remoteError}
          isTesting={isTestingRemote}
          missingFields={missingRemoteFields}
          onChange={updateRemoteConfig}
          onClear={clearRemoteConfig}
          onClose={() => setDrawerOpen(false)}
          onTest={testRemoteConnection}
        />
      )}
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
  status,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  status: string;
}) {
  return (
    <button
      aria-selected={active}
      className={cn(
        "rounded-xl border-2 px-4 py-3 text-left transition focus:outline-none focus:ring-4 focus:ring-sky-200",
        active
          ? "border-sky-500 bg-sky-100 shadow-[4px_4px_0_rgba(14,165,233,0.18)]"
          : "border-transparent bg-transparent hover:bg-teal-50",
      )}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <span className="block text-sm font-extrabold text-[#123047]">
        {label}
      </span>
      <span className="mt-1 block text-xs font-semibold text-[#466778]">
        {status}
      </span>
    </button>
  );
}

function RemoteConfigDrawer({
  config,
  connection,
  error,
  isTesting,
  missingFields,
  onChange,
  onClear,
  onClose,
  onTest,
}: {
  config: RemoteKafkaConfig;
  connection: ConnectionStatus | null;
  error: string | null;
  isTesting: boolean;
  missingFields: string[];
  onChange: (config: RemoteKafkaConfig) => void;
  onClear: () => void;
  onClose: () => void;
  onTest: () => void;
}) {
  function patchConfig(patch: Partial<RemoteKafkaConfig>) {
    onChange({ ...config, ...patch });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#123047]/30">
      <button
        aria-label="Close remote connection settings"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label="Remote Kafka connection"
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l-[3px] border-teal-700 bg-[#fffdf5] p-6 shadow-[-10px_0_0_rgba(15,118,110,0.16)]"
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-teal-700 pb-4">
          <div>
            <h3 className="text-xl font-extrabold text-[#123047]">
              Remote Kafka
            </h3>
            <p className="mt-1 text-sm leading-6 text-[#466778]">
              Saved in this browser and sent to the server only for tests and
              active runs.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} type="button">
            Close
          </Button>
        </div>

        <div className="mt-5 grid gap-4">
          <Field label="Brokers">
            <input
              className={fieldClassName}
              onChange={(event) =>
                patchConfig({ brokers: event.currentTarget.value })
              }
              placeholder="broker-1.example.com:9092,broker-2.example.com:9092"
              value={config.brokers}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username">
              <input
                className={fieldClassName}
                onChange={(event) =>
                  patchConfig({ username: event.currentTarget.value })
                }
                value={config.username}
              />
            </Field>
            <Field label="Password">
              <input
                className={fieldClassName}
                onChange={(event) =>
                  patchConfig({ password: event.currentTarget.value })
                }
                type="password"
                value={config.password}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SASL mechanism">
              <select
                className={fieldClassName}
                onChange={(event) =>
                  patchConfig({
                    saslMechanism: event.currentTarget
                      .value as RemoteKafkaConfig["saslMechanism"],
                  })
                }
                value={config.saslMechanism}
              >
                <option value="PLAIN">PLAIN</option>
                <option value="SCRAM-SHA-256">SCRAM-SHA-256</option>
                <option value="SCRAM-SHA-512">SCRAM-SHA-512</option>
              </select>
            </Field>
            <label className="flex min-h-24 items-center gap-3 rounded-2xl border-2 border-teal-700 bg-teal-50 p-4 text-sm font-extrabold text-teal-800">
              <input
                checked={config.useTls}
                className="size-5 accent-teal-700"
                onChange={(event) =>
                  patchConfig({ useTls: event.currentTarget.checked })
                }
                type="checkbox"
              />
              Use TLS
            </label>
          </div>
          <Field label="CA certificate">
            <textarea
              className={cn(fieldClassName, "min-h-36 resize-y")}
              onChange={(event) =>
                patchConfig({ caCertificate: event.currentTarget.value })
              }
              placeholder="Optional PEM certificate"
              value={config.caCertificate}
            />
          </Field>
        </div>

        <div className="mt-5 rounded-2xl border-[3px] border-teal-700 bg-teal-50 p-4 text-sm text-[#31566a]">
          <div className="font-extrabold text-[#123047]">
            {remoteStatusLabel(connection, missingFields)}
          </div>
          {connection?.maskedBrokerHost && (
            <p className="mt-1">Host: {connection.maskedBrokerHost}</p>
          )}
          {connection?.error && (
            <p className="mt-1 text-rose-800">{connection.error.message}</p>
          )}
          {error && <p className="mt-1 text-rose-800">{error}</p>}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={onTest} disabled={isTesting} type="button">
            {isTesting ? "Testing" : "Test connection"}
          </Button>
          <Button variant="danger" onClick={onClear} type="button">
            Clear saved config
          </Button>
        </div>
      </aside>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-2 text-sm font-extrabold text-[#123047]">
      {label}
      {children}
    </label>
  );
}

function ConnectionNotice({
  connection,
}: {
  connection: ConnectionStatus | null;
}) {
  if (
    !connection ||
    !["configuration_missing", "connection_failed"].includes(connection.status)
  )
    return null;
  return (
    <div className="mt-5 rounded-2xl border-[3px] border-amber-500 bg-amber-100 p-3 text-left text-sm text-amber-900 shadow-[7px_7px_0_rgba(245,158,11,0.18)]">
      <div className="font-extrabold">{connectionLabel(connection)}</div>
      {connection.missingVariables.length > 0 && (
        <p className="mt-1 text-amber-900/80">
          Set {connection.missingVariables.join(", ")}.
        </p>
      )}
      {connection.error && (
        <p className="mt-1 text-amber-900/80">{connection.error.message}</p>
      )}
    </div>
  );
}

function connectionLabel(connection: ConnectionStatus | null) {
  if (!connection) return "Ready";
  if (connection.status === "demo_mode") return "Local demo runtime";
  if (connection.status === "connected") return "Connected";
  if (connection.status === "configuration_missing")
    return "Configuration missing";
  if (connection.status === "connection_failed") return "Connection failed";
  return "Disconnected";
}

function remoteStatusLabel(
  connection: ConnectionStatus | null,
  missingFields: string[],
) {
  if (missingFields.length > 0) return "Configuration required";
  if (!connection) return "Ready to test";
  if (connection.status === "connected") return "Connected";
  if (connection.status === "connection_failed") return "Connection failed";
  if (connection.status === "configuration_missing")
    return "Configuration required";
  return "Ready";
}

function requiredRemoteFields(config: RemoteKafkaConfig) {
  const missing = [];
  if (!config.brokers.trim()) missing.push("brokers");
  if (!config.username.trim()) missing.push("username");
  if (!config.password) missing.push("password");
  return missing;
}

function normalizeRemoteConfig(value: unknown): RemoteKafkaConfig {
  if (!value || typeof value !== "object") return defaultRemoteKafkaConfig;
  const record = value as Partial<RemoteKafkaConfig>;
  return {
    brokers: typeof record.brokers === "string" ? record.brokers : "",
    username: typeof record.username === "string" ? record.username : "",
    password: typeof record.password === "string" ? record.password : "",
    saslMechanism: isSaslMechanism(record.saslMechanism)
      ? record.saslMechanism
      : "SCRAM-SHA-256",
    useTls: typeof record.useTls === "boolean" ? record.useTls : true,
    caCertificate:
      typeof record.caCertificate === "string" ? record.caCertificate : "",
  };
}

function loadSavedRemoteConfig() {
  if (typeof window === "undefined") return defaultRemoteKafkaConfig;
  const saved = window.localStorage.getItem(REMOTE_CONFIG_STORAGE_KEY);
  if (!saved) return defaultRemoteKafkaConfig;
  try {
    return normalizeRemoteConfig(JSON.parse(saved));
  } catch {
    window.localStorage.removeItem(REMOTE_CONFIG_STORAGE_KEY);
    return defaultRemoteKafkaConfig;
  }
}

function isSaslMechanism(
  value: unknown,
): value is RemoteKafkaConfig["saslMechanism"] {
  return (
    value === "PLAIN" || value === "SCRAM-SHA-256" || value === "SCRAM-SHA-512"
  );
}

const fieldClassName =
  "w-full rounded-xl border-2 border-teal-700 bg-white px-3 py-2 text-sm font-semibold text-[#123047] shadow-[3px_3px_0_rgba(15,118,110,0.1)] outline-none focus:ring-4 focus:ring-sky-200";
