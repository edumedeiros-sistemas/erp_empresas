import { Input, Label } from '@/components/Ui'

export function ListFilterBar({
  label,
  placeholder,
  value,
  onChange,
  className = '',
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
