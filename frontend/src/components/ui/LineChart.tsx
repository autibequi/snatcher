import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { CHART_COLORS, CHART_GRID_STYLE, CHART_AXIS_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/chartTokens'

interface LineChartProps {
  data: Record<string, unknown>[]
  dataKeys: string[]
  xKey?: string
  height?: number
  showLegend?: boolean
  formatter?: (value: number) => string
}

export function LineChart({
  data,
  dataKeys,
  xKey = 'date',
  height = 200,
  showLegend = false,
  formatter,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid {...CHART_GRID_STYLE} />
        <XAxis
          dataKey={xKey}
          tick={CHART_AXIS_STYLE.tick}
          axisLine={CHART_AXIS_STYLE.axisLine}
          tickLine={CHART_AXIS_STYLE.tickLine}
        />
        <YAxis
          tick={CHART_AXIS_STYLE.tick}
          axisLine={CHART_AXIS_STYLE.axisLine}
          tickLine={CHART_AXIS_STYLE.tickLine}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
          labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
          formatter={formatter ? (v: unknown) => [formatter(v as number)] : undefined}
        />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11, color: 'var(--fg-3)' }} />}
        {dataKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: CHART_COLORS[i % CHART_COLORS.length] }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
