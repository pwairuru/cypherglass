import type { VariantSpec } from "../../charts/types";

export default function VariantTabs({
  variants,
  active,
  onChange,
}: {
  variants: VariantSpec[];
  active?: string;
  onChange: (id: string) => void;
}) {
  if (variants.length <= 1) return null;
  return (
    <div className="chart-variants" role="tablist" aria-label="Chart variants">
      {variants.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={active === v.id}
          className={`btn-segmented${active === v.id ? " is-active" : ""}`}
          onClick={() => onChange(v.id)}
          title={v.note}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
