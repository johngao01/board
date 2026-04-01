import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { apiGet, formatDateInput } from '../lib/api'
import type { JuheShanghaiResponse, JuheStatsResponse } from '../lib/juhe'

function trendClass(value: number) {
  if (value > 0) {
    return 'up'
  }
  if (value < 0) {
    return 'down'
  }
  return 'flat'
}

function trendText(value: number) {
  if (value > 0) {
    return `▲ ${value}%`
  }
  if (value < 0) {
    return `▼ ${Math.abs(value)}%`
  }
  return '-'
}

export function JuhePage() {
  const [date, setDate] = useState(() => formatDateInput(new Date()))
  const [stats, setStats] = useState<JuheStatsResponse | null>(null)
  const [shanghai, setShanghai] = useState<JuheShanghaiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadJuhe() {
      setLoading(true)
      setError(null)

      try {
        const [statsResponse, shanghaiResponse] = await Promise.all([
          apiGet<JuheStatsResponse>(`/api/juhe/stats?date=${date}`),
          apiGet<JuheShanghaiResponse>(`/api/juhe/shanghai?date=${date}`),
        ])

        if (cancelled) {
          return
        }

        setStats(statsResponse)
        setShanghai(shanghaiResponse)
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : '聚合数据加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadJuhe()

    return () => {
      cancelled = true
    }
  }, [date])

  const cityOption = useMemo<EChartsOption | undefined>(() => {
    if (!stats) {
      return undefined
    }

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        bottom: 0,
        itemWidth: 18,
        itemHeight: 10,
        textStyle: { color: '#c2cbdb' },
      },
      grid: { left: 28, right: 52, top: 48, bottom: 44, containLabel: true },
      xAxis: {
        type: 'category',
        data: stats.chart_city.map((item) => item.name),
        axisLabel: { color: '#c2cbdb', interval: 0 },
        axisLine: { lineStyle: { color: '#384357' } },
      },
      yAxis: [
        {
          type: 'value',
          axisLabel: { color: '#9faabd' },
          splitLine: { lineStyle: { color: '#2b3445' } },
        },
        {
          type: 'value',
          max: 100,
          axisLabel: { color: '#9faabd', formatter: '{value}%' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '总量',
          type: 'bar',
          barGap: '-100%',
          barWidth: 56,
          data: stats.chart_city.map((item) => item.total),
          itemStyle: { color: '#3a3a3a' },
          label: { show: true, position: 'top', color: '#8d93a6', fontWeight: 'bold' },
        },
        {
          name: '有效',
          type: 'bar',
          barWidth: 56,
          data: stats.chart_city.map((item) => item.valid),
          itemStyle: { color: '#12f0a2' },
          label: { show: true, position: 'top', color: '#12f0a2', fontWeight: 'bold' },
        },
        {
          name: '有效率',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 8,
          data: stats.chart_city.map((item) => item.rate),
          itemStyle: { color: '#ffd200' },
          lineStyle: { color: '#ffd200', width: 3 },
          label: {
            show: true,
            formatter: '{c}%',
            color: '#ffd200',
            fontWeight: 'bold',
          },
        },
      ],
    }
  }, [stats])

  const sourceOption = useMemo<EChartsOption | undefined>(() => {
    if (!stats) {
      return undefined
    }

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}<br/>总量 {c}<br/>占比 {d}%' },
      color: ['#4f8df0', '#70efab', '#ffe06b', '#ff6675'],
      series: [
        {
          type: 'pie',
          radius: ['52%', '72%'],
          center: ['50%', '54%'],
          itemStyle: { borderRadius: 4, borderColor: '#1a2233', borderWidth: 2 },
          label: {
            show: true,
            formatter: '{b}\n总量 {c}\n占比 {d}%',
            color: '#dce4f2',
            fontSize: 12,
            lineHeight: 20,
          },
          labelLine: {
            lineStyle: { color: '#5f6d83' },
          },
          data: stats.chart_source,
        },
      ],
    }
  }, [stats])

  const shanghaiSourceOption = useMemo<EChartsOption | undefined>(() => {
    if (!shanghai) {
      return undefined
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: '{b}<br/>总量 {c}<br/>占比 {d}%',
      },
      color: ['#4f8df0', '#70efab', '#ffe06b', '#ff6675'],
      series: [
        {
          type: 'pie',
          radius: ['50%', '72%'],
          center: ['50%', '54%'],
          itemStyle: { borderRadius: 4, borderColor: '#1a2233', borderWidth: 2 },
          label: {
            show: true,
            formatter: '{b}\n总量 {c}\n占比 {d}%',
            color: '#dce4f2',
            fontSize: 12,
            lineHeight: 20,
          },
          labelLine: {
            lineStyle: { color: '#5f6d83' },
          },
          data: shanghai.sh_breakdown,
        },
      ],
    }
  }, [shanghai])

  const shanghaiTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!shanghai) {
      return undefined
    }

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        top: 0,
        itemWidth: 18,
        itemHeight: 10,
        textStyle: { color: '#c2cbdb' },
      },
      grid: { left: 28, right: 24, top: 52, bottom: 28, containLabel: true },
      xAxis: {
        type: 'category',
        data: shanghai.history.dates,
        axisLabel: { color: '#aab5c8', hideOverlap: true },
        axisLine: { lineStyle: { color: '#384357' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#9faabd' },
        splitLine: { lineStyle: { color: '#2b3445' } },
      },
      series: [
        {
          name: '上海新增',
          type: 'line',
          smooth: true,
          symbolSize: 7,
          data: shanghai.history.sh_vals,
          itemStyle: { color: '#ffd200' },
          lineStyle: { color: '#ffd200', width: 3 },
          label: { show: true, color: '#ffd200', fontWeight: 'bold', formatter: '{c}' },
        },
        {
          name: '所有',
          type: 'line',
          smooth: true,
          symbolSize: 7,
          data: shanghai.history.all_vals,
          itemStyle: { color: '#10e8ff' },
          lineStyle: { color: '#10e8ff', width: 3 },
          label: { show: true, color: '#10e8ff', fontWeight: 'bold', formatter: '{c}' },
        },
      ],
    }
  }, [shanghai])

  const headerDate = date.replaceAll('-', '/')

  return (
    <section className="page juhe-page">
      <div className="juhe-header">
        <div className="juhe-title-block">
          <h3>
            <span className="juhe-title-icon">✴</span>
            Juhe 聚合数据
          </h3>
        </div>

        <div className="juhe-header-actions">
          <div className="juhe-date-controller">
            <button
              type="button"
              className="juhe-date-arrow"
              onClick={() => {
                const target = new Date(`${date}T00:00:00`)
                target.setDate(target.getDate() - 1)
                setDate(formatDateInput(target))
              }}
            >
              ‹
            </button>
            <label className="juhe-date-label">
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <span>{headerDate}</span>
              <span className="juhe-date-calendar" aria-hidden="true">
                📅
              </span>
            </label>
            <button
              type="button"
              className="juhe-date-arrow"
              onClick={() => {
                const target = new Date(`${date}T00:00:00`)
                target.setDate(target.getDate() + 1)
                setDate(formatDateInput(target))
              }}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="error-banner">接口加载失败：{error}</div> : null}

      <div className="stats-grid juhe-stats-grid">
        <article className="dashboard-card juhe-kpi-card juhe-kpi-green">
          <p className="dashboard-card-title">有效资源 / 总量 (占比)</p>
          <div className="dashboard-card-value-row">
            <strong className="dashboard-card-value juhe-kpi-compact">
              {loading ? '...' : stats?.kpi.total_str ?? '-'}
            </strong>
            <span className="trend-badge up">{stats?.kpi.rate ?? 0}%</span>
          </div>
        </article>

        <article className="dashboard-card juhe-kpi-card">
          <p className="dashboard-card-title">🔥 今日新增</p>
          <div className="dashboard-card-value-row">
            <strong className="dashboard-card-value">{loading ? '...' : stats?.kpi.today_new ?? 0}</strong>
            <span className={`trend-badge ${trendClass(stats?.kpi.trend_new ?? 0)}`}>
              {trendText(stats?.kpi.trend_new ?? 0)}
            </span>
          </div>
        </article>

        <article className="dashboard-card juhe-kpi-card juhe-kpi-yellow">
          <p className="dashboard-card-title">✨ 今日有效新增</p>
          <div className="dashboard-card-value-row">
            <strong className="dashboard-card-value">{loading ? '...' : stats?.kpi.today_valid_new ?? 0}</strong>
            <span className={`trend-badge ${trendClass(stats?.kpi.trend_valid_new ?? 0)}`}>
              {trendText(stats?.kpi.trend_valid_new ?? 0)}
            </span>
          </div>
        </article>

        <article className="dashboard-card juhe-kpi-card juhe-kpi-red">
          <p className="dashboard-card-title">💀 失效资源 (VALID &lt; 0)</p>
          <div className="dashboard-card-value-row">
            <strong className="dashboard-card-value">{loading ? '...' : stats?.kpi.invalid ?? 0}</strong>
          </div>
        </article>
      </div>

      <div className="juhe-panel-grid">
        <section className="panel juhe-panel juhe-panel-wide">
          <div className="panel-head">
            <div>
              <h4 className="juhe-panel-title">热门城市数据质量</h4>
            </div>
          </div>
          {cityOption ? (
            <ReactECharts option={cityOption} style={{ height: 470 }} />
          ) : (
            <div className="empty-state">暂无城市质量数据</div>
          )}
        </section>

        <section className="panel juhe-panel">
          <div className="panel-head">
            <div>
              <h4 className="juhe-panel-title">全平台来源分布</h4>
            </div>
          </div>
          {sourceOption ? (
            <ReactECharts option={sourceOption} style={{ height: 470 }} />
          ) : (
            <div className="empty-state">暂无来源分布数据</div>
          )}
        </section>
      </div>

      <section className="juhe-detail-section">
        <div className="juhe-detail-title">
          <span className="juhe-detail-mark" />
          <h4>🏙 上海市详细数据监控</h4>
        </div>

        <div className="juhe-panel-grid">
          <section className="panel juhe-panel juhe-panel-wide">
            <div className="panel-head">
              <div>
                <h4 className="juhe-panel-title">上海平台分布</h4>
              </div>
            </div>
            {shanghaiSourceOption ? (
              <ReactECharts option={shanghaiSourceOption} style={{ height: 470 }} />
            ) : (
              <div className="empty-state">暂无上海平台分布数据</div>
            )}
          </section>

          <section className="panel juhe-panel">
            <div className="panel-head">
              <div>
                <h4 className="juhe-panel-title">近30天新增趋势对比</h4>
              </div>
            </div>
            {shanghaiTrendOption ? (
              <ReactECharts option={shanghaiTrendOption} style={{ height: 470 }} />
            ) : (
              <div className="empty-state">暂无上海趋势数据</div>
            )}
          </section>
        </div>
      </section>
    </section>
  )
}
