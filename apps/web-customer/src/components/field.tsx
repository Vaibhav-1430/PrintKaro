import type { ReactNode } from 'react';
import { Input, Label, type InputProps } from '@print-karo/ui';

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-danger text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  error,
  id,
  ...props
}: InputProps & { label: string; error?: string; id: string }) {
  return (
    <Field label={label} htmlFor={id} error={error}>
      <Input id={id} aria-invalid={Boolean(error)} {...props} />
    </Field>
  );
}
