import { Input, Label, type InputProps } from '@print-karo/ui';

export function TextField({
  label,
  error,
  id,
  ...props
}: InputProps & { label: string; error?: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={Boolean(error)} {...props} />
      {error ? (
        <p className="text-danger text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
