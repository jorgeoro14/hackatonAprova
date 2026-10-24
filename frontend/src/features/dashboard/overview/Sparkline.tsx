import { Area, AreaChart, ResponsiveContainer } from 'recharts'

export function Sparkline({ data, id }: { data: { value: number }[]; id: string }) {
  return (
    <div className="h-12 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cyan)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--cyan)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke="var(--cyan)" strokeWidth={2} fill={`url(#sp-${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
