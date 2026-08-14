import * as React from "react"
import { Input } from "@/components/ui/input"

export function NumericInput({
  value,
  onChange,
  className,
  min,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
  min?: number
}) {
  const [text, setText] = React.useState(String(value))

  React.useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = () => {
    const parsed = parseFloat(text)
    if (!isNaN(parsed)) {
      const clamped = min !== undefined ? Math.max(min, parsed) : parsed
      onChange(clamped)
      if (clamped !== parsed) setText(String(clamped))
    } else {
      setText(String(value))
    }
  }

  const handleChange = (newText: string) => {
    setText(newText)
    const parsed = parseFloat(newText)
    if (!isNaN(parsed)) {
      const clamped = min !== undefined ? Math.max(min, parsed) : parsed
      onChange(clamped)
    }
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur() } }}
      className={className}
    />
  )
}
