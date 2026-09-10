import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

export interface Option {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: Option[]
  className?: string
  placeholder?: string
  title?: string
  ariaLabel?: string
}

/**
 * The common case: a flat list of options bound to a string value. Wraps the
 * shadcn Select so call sites stay one element instead of six.
 */
export function SimpleSelect({
  value,
  onChange,
  options,
  className,
  placeholder,
  title,
  ariaLabel
}: Props): React.JSX.Element {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} title={title} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
