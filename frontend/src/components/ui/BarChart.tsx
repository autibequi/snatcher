import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { CHART_COLORS, CHART_GRID_STYLE, CHART_AXIS_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/chartTokens'

interface BarChartProps {
  data: Record<string, unknown>[]
  dataKeys: string[]
  xKey?: string
  height?: number
  stacked?: boolean
  formatter?: (value: number) => string
}

export function BarChart({
  data,
  dataKeys,
  xKey = 'date',
  height = 200,
  stacked = false,
  formatter,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid {...CHART_GRID_STYLE} vertical={false} />
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
        {dataKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            radius={[3, 3, 0, 0]}
            stackId={stacked ? 'stack' : undefined}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
