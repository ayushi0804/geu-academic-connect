import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { EmptyState } from './ui';
import { BarChart3 } from 'lucide-react';

export const PALETTE = ['hsl(238 62% 52%)', 'hsl(40 62% 50%)', 'hsl(152 50% 38%)', 'hsl(2 68% 52%)', 'hsl(200 70% 45%)', 'hsl(280 45% 52%)'];
const axis = { stroke: 'hsl(var(--muted-fg))', fontSize: 12, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 } };

function Frame({ data, height = 260, children, label }: { data?: any[]; height?: number; children: React.ReactElement; label: string }) {
  if (!data || data.length === 0) return <EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No data yet" hint="This chart will fill in as records are added." />;
  return <div role="img" aria-label={label} style={{ height }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}

export function TrendChart({ data, x, lines, unit = '%', domain = [0, 100], label }: { data?: any[]; x: string; lines: { key: string; name: string }[]; unit?: string; domain?: [number, number]; label: string }) {
  return (
    <Frame data={data} label={label}>
      <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey={x} {...axis} /><YAxis {...axis} domain={domain} unit={unit} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l, i) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={PALETTE[i]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />)}
      </LineChart>
    </Frame>
  );
}
export function AreaTrend({ data, x, y, name, unit = '' }: { data?: any[]; x: string; y: string; name: string; unit?: string }) {
  return (
    <Frame data={data} label={`${name} over time`}>
      <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey={x} {...axis} /><YAxis {...axis} unit={unit} allowDecimals={false} /><Tooltip {...tip} />
        <Area type="monotone" dataKey={y} name={name} stroke={PALETTE[0]} fill={PALETTE[0]} fillOpacity={0.15} strokeWidth={2.5} />
      </AreaChart>
    </Frame>
  );
}
export function Bars({ data, x, bars, unit = '', domain, label, height }: { data?: any[]; x: string; bars: { key: string; name: string }[]; unit?: string; domain?: [number, number]; label: string; height?: number }) {
  return (
    <Frame data={data} label={label} height={height}>
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey={x} {...axis} /><YAxis {...axis} unit={unit} domain={domain} allowDecimals={false} /><Tooltip {...tip} cursor={{ fill: 'hsl(var(--muted))' }} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {bars.map((b, i) => <Bar key={b.key} dataKey={b.key} name={b.name} fill={PALETTE[i]} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </Frame>
  );
}
export function Donut({ data, name, value, label }: { data?: any[]; name: string; value: string; label: string }) {
  return (
    <Frame data={data?.filter((d) => d[value] > 0)} label={label}>
      <PieChart><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Pie data={data} dataKey={value} nameKey={name} innerRadius={55} outerRadius={85} paddingAngle={2}>{data?.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie>
      </PieChart>
    </Frame>
  );
}
