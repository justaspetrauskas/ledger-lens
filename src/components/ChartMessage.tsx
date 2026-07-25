import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import type { ChartSpec } from '../lib/types'

const compactDKK = (n: number) =>
  new Intl.NumberFormat('da-DK', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export function ChartMessage({ spec }: { spec: ChartSpec }) {
  const base: ApexOptions = {
    chart: {
      type: spec.type,
      toolbar: { show: false },
      fontFamily: 'inherit',
      foreColor: 'var(--text-dim)',
    },
    plotOptions: {
      line: { isSlopeChart: false },
      bar: { borderRadius: 3, columnWidth: '60%' },
      pie: { donut: { size: '65%' } },
    },
    title: { text: spec.title, style: { fontSize: '13px', fontWeight: '600' } },
    colors: ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#65a30d', '#0d9488', '#64748b'],
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => `DKK ${new Intl.NumberFormat('da-DK').format(v)}` } },
  }

  if (spec.type === 'donut') {
    return (
      <div className="chart-card">
        <Chart
          type="donut"
          height={280}
          series={spec.series[0]?.data ?? []}
          options={{
            ...base,
            labels: spec.labels,
            legend: { position: 'bottom' },
            stroke: { width: 0 },
          }}
        />
      </div>
    )
  }

  return (
    <div className="chart-card">
      <Chart
        type={spec.type}
        height={280}
        series={spec.series}
        options={{
          ...base,
          xaxis: { categories: spec.labels, labels: { rotate: -35, style: { fontSize: '11px' } } },
          yaxis: { labels: { formatter: compactDKK } },
          stroke: spec.type === 'line' ? { curve: 'smooth', width: 3 } : { width: 0 },
          plotOptions:
            spec.type === 'bar'
              ? { ...base.plotOptions, bar: { borderRadius: 3, columnWidth: '60%' } }
              : base.plotOptions,
          grid: { borderColor: 'var(--border)' },
        }}
      />
    </div>
  )
}
