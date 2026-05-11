import { SegmentedControl } from '../../components/ui'
import { useTheme } from '../../lib/theme'
import { sectionCard, sectionTitle } from '../../lib/uiTokens'

type Accent = 'indigo' | 'green' | 'orange' | 'pink'

const ACCENT_COLORS: Record<Accent, string> = {
  indigo: '#bd93f9',
  green: '#50fa7b',
  orange: '#ffb86c',
  pink: '#ff79c6',
}

export function AppearanceTab() {
  const { theme, setTheme, density, setDensity, accent, setAccent } = useTheme()

  return (
    <div className="space-y-5 max-w-sm">

      {/* Tema */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Tema</p>
        <SegmentedControl
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ]}
        />
      </div>

      {/* Densidade */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Densidade</p>
        <SegmentedControl
          value={density}
          onChange={setDensity}
          options={[
            { value: 'compact', label: 'Compacto' },
            { value: 'comfy', label: 'Confortavel' },
          ]}
        />
      </div>

      {/* Acento */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Cor de Acento</p>
        <div className="flex gap-3">
          {(Object.keys(ACCENT_COLORS) as Accent[]).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => setAccent(a)}
              className={`w-8 h-8 rounded-full border-2 transition-colors ${accent === a ? 'border-fg' : 'border-transparent'}`}
              style={{ backgroundColor: ACCENT_COLORS[a] }}
              title={a.charAt(0).toUpperCase() + a.slice(1)}
            />
          ))}
        </div>
      </div>

    </div>
  )
}
