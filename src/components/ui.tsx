/**
 * Shared presentational primitives.
 *
 * These deliberately reuse the dashboard's existing design-system class names
 * (.section-head, .indicator, .action, .role-switcher, .risk-pill) so every page
 * keeps the same institutional look, and add only the states the old markup
 * never had: loading, error and empty.
 */

import type { ReactNode } from "react";
import type { RiskTone } from "./TunisiaMap";

export function RiskPill({ tone, children }: { tone: RiskTone; children: ReactNode }) {
  return (
    <span className={`risk-pill ${tone}`}>
      <i />
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="loading-note">
      <span className="spinner" />
      {label ?? "Loading…"}
    </span>
  );
}

/** Honest empty/error state: says what is missing instead of rendering a zero. */
export function DataState({
  loading,
  error,
  empty,
  children,
  idle,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  idle?: boolean;
  children?: ReactNode;
}) {
  if (error) {
    return (
      <div className="data-state is-error">
        <strong>Data unavailable</strong>
        <p>{error}</p>
      </div>
    );
  }
  if (loading) return <Spinner />;
  if (empty) {
    return (
      <div className="data-state">
        <strong>No measured data</strong>
        <p>Upstream sources returned no records for this selection.</p>
      </div>
    );
  }
  if (idle) return <p className="hint">Run the model to populate this panel.</p>;
  return <>{children}</>;
}

export function Panel({
  title,
  subtitle,
  actions,
  legend,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className.trim()}>
      <div className="section-head">
        <div>
          <h2 className="section-title">{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {legend ? <div className="legend">{legend}</div> : null}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const classes = ["action"];
  if (variant === "primary") classes.push("primary");
  if (variant === "ghost") classes.push("text-action");
  return (
    <button type={type} className={classes.join(" ")} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  unit,
  context,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  context?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className={`indicator${emphasis ? " risk" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {unit ? <small>{unit}</small> : null}
      {context ? <p>{context}</p> : null}
    </div>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
  id,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "" ? "All crops" : option}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Segmented control (period switch, user profile) built on .role-switcher. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Human labels keyed by option, e.g. { last_year: "Last 12 months" }. */
  labels?: Record<string, string>;
}) {
  return (
    <div className="role-switcher" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`role-btn${option === value ? " active" : ""}`}
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          title={labels?.[option] ?? option}
        >
          {labels?.[option] ?? option}
        </button>
      ))}
    </div>
  );
}

export function SourceNote({ children }: { children: ReactNode }) {
  return <p className="source-note">{children}</p>;
}
