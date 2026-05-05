interface CategoryPickerProps {
  value: 'ecommerce' | 'cdkey'
  onChange: (category: 'ecommerce' | 'cdkey') => void
  disabled?: boolean
}

export function CategoryPicker({ value, onChange, disabled = false }: CategoryPickerProps) {
  return (
    <div className="flex gap-4">
      <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <input
          type="radio"
          name="category"
          value="ecommerce"
          checked={value === 'ecommerce'}
          onChange={e => onChange(e.target.value as 'ecommerce' | 'cdkey')}
          disabled={disabled}
          className="w-4 h-4"
        />
        <span className="text-sm font-medium">E-commerce</span>
      </label>
      <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <input
          type="radio"
          name="category"
          value="cdkey"
          checked={value === 'cdkey'}
          onChange={e => onChange(e.target.value as 'ecommerce' | 'cdkey')}
          disabled={disabled}
          className="w-4 h-4"
        />
        <span className="text-sm font-medium">CD Key</span>
      </label>
    </div>
  )
}
