import { inputClass } from "@/components/catalog/classes";
import { catalogMessages as c } from "@/i18n/catalog-ro";
import { customerMessages as m } from "@/i18n/customer-ro";
import { showLength } from "@/modules/catalog/validation";
import type { MeasurementField } from "@/modules/customer/measurements";

export function MeasureField({
  field,
  value,
  change,
  invalid,
  prefix = "measurement",
}: {
  field: MeasurementField;
  value?: string;
  change?: (value: string) => void;
  invalid?: boolean;
  prefix?: string;
}) {
  const id = prefix + "-" + field.id;
  return (
    <div className="grid gap-1">
      <label className="font-semibold" htmlFor={id}>
        {field.name} ({field.unit}) · {field.required ? c.required : c.optional}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        maxLength={24}
        className={inputClass}
        value={value}
        onChange={change ? (event) => change(event.target.value) : undefined}
        aria-required={field.required}
        aria-invalid={invalid || undefined}
        aria-describedby={id + "-hint"}
      />
      <div id={id + "-hint"} className="text-sm text-muted-foreground">
        <p>
          {showLength(field.min, field.unit)}–
          {showLength(field.max, field.unit)} {field.unit}
          {field.precision !== null && " · " + m.scale + " " + field.precision}
        </p>
        {field.description && (
          <p className="whitespace-pre-wrap">{field.description}</p>
        )}
        {field.instructions && (
          <p className="whitespace-pre-wrap">{field.instructions}</p>
        )}
      </div>
    </div>
  );
}
