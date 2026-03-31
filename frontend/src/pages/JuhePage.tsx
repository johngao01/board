import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { apiGet, formatDateInput } from '../lib/api'
import type { JuheShanghaiResponse, JuheStatsResponse } from '../lib/juhe'

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

  const cityOption = stats
    ? {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, textStyle: { color: 'var(--muted)' } },
        grid: { left: 24, right: 24, top: 40, bottom: 28, containLabel: true },
        xAxis: {
          type: 'category',
          data: stats.chart_city.map((item) => item.name),
          axisLabel: { color: 'var(--muted)', interval: 0, rotate: 20 },
        },
        yAxis: [
          {
            type: 'value',
            axisLabel: { color: 'var(--muted)' },
            splitLine: { lineStyle: { color: 'rgba(127,127,127,0.15)' } },
          },
          {
            type: 'value',
            max: 100,
            axisLabel: { color: 'var(--muted)', formatter: '{value}%' },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: '总量',
            type: 'bar',
            data: stats.chart_city.map((item) => item.total),
            itemStyle: { color: '#5a657a' },
          },
          {
            name: '有效',
            type: 'bar',
            data: stats.chart_city.map((item) => item.valid),
            itemStyle: { color: '#e8bb52' },
          },
          {
            name: '有效率',
            type: 'line',
            yAxisIndex: 1,
            smooth: true,
            data: stats.chart_city.map((item) => item.rate),
            itemStyle: { color: '#4dd4c6' },
            lineStyle: { width: 3 },
          },
        ],
      }
    : undefined

  const sourceOption = stats
    ? {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { color: 'var(--muted)' } },
        series: [
          {
            type: 'pie',
            radius: ['45%', '72%'],
            center: ['50%', '44%'],
            itemStyle: { borderRadius: 10 },
            data: stats.chart_source,
          },
        ],
      }
    : undefined

  const shSourceOption = shanghai
    ? {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { color: 'var(--muted)' } },
        series: [
          {
            type: 'pie',
            radius: ['42%', '70%'],
            center: ['50%', '44%'],
            itemStyle: { borderRadius: 10 },
            data: shanghai.sh_breakdown,
          },
        ],
      }
    : undefined

  const shTrendOption = shanghai
    ? {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { top: 0, textStyle: { color: 'var(--muted)' } },
        grid: { left: 24, right: 24, top: 40, bottom: 20, containLabel: true },
        xAxis: {
          type: 'category',
          data: shanghai.history.dates,
          axisLabel: { color: 'var(--muted)', showMaxLabel: true, showMinLabel: true },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: 'var(--muted)' },
          splitLine: { lineStyle: { color: 'rgba(127,127,127,0.15)' } },
        },
        series: [
          {
            name: '上海新增',
            type: 'line',
            smooth: true,
            data: shanghai.history.sh_vals,
            itemStyle: { color: '#e8bb52' },
            lineStyle: { width: 3 },
          },
          {
            name: '全网新增',
            type: 'line',
            smooth: true,
            data: shanghai.history.all_vals,
            itemStyle: { color: '#4dd4c6' },
            lineStyle: { width: 3 },
          },
        ],
      }
    : undefined

  return (
    <section className="page">
      <div className="page-hero juhe-hero">
        <div className="hero-row">
          <div>
            <p className="section-kicker">Juhe Dashboard</p>
            <h3>Juhe 页面已经接入真实聚合接口</h3>
            <p className="section-copy">
              现在这里直接读取现有 `juhe/stats` 和 `juhe/shanghai` 接口，不再维护另一套模板页逻辑。
            </p>
          </div>

          <label className="date-field">
            <span>统计日期</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>
      </div>

      {error ? <div className="error-banner">接口加载失败：{error}</div> : null}

      <div className="stats-grid">
        <article className="stat-card accent-gold">
          <p className="stat-title">有效 / 总量</p>
          <strong className="stat-value compact">{loading ? '...' : stats?.kpi.total_str ?? '-'}</strong>
          <p className="stat-copy">有效率 {stats?.kpi.rate ?? 0}%</p>
        </article>
        <article className="stat-card accent-cyan">
          <p className="stat-title">今日新增</p>
          <strong className="stat-value">{loading ? '...' : stats?.kpi.today_new ?? 0}</strong>
          <p className="stat-copy">昨日 {stats?.kpi.prev_new ?? 0}</p>
        </article>
        <article className="stat-card accent-gold">
          <p className="stat-title">今日有效新增</p>
          <strong className="stat-value">{loading ? '...' : stats?.kpi.today_valid_new ?? 0}</strong>
          <p className="stat-copy">昨日 {stats?.kpi.prev_valid_new ?? 0}</p>
        </article>
        <article className="stat-card accent-rose">
          <p className="stat-title">失效资源</p>
          <strong className="stat-value">{loading ? '...' : stats?.kpi.invalid ?? 0}</strong>
          <p className="stat-copy">当前全表失效数量</p>
        </article>
      </div>

      <div className="panel-grid">
        <section className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="section-kicker">City Quality</p>
              <h4>热门城市数据质量</h4>
            </div>
          </div>
          {cityOption ? (
            <ReactECharts option={cityOption} style={{ height: 360 }} />
          ) : (
            <div className="empty-state">暂无城市质量数据</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Source</p>
              <h4>全平台来源分布</h4>
            </div>
          </div>
          {sourceOption ? (
            <ReactECharts option={sourceOption} style={{ height: 340 }} />
          ) : (
            <div className="empty-state">暂无来源分布数据</div>
          )}
        </section>
      </div>

      <div className="panel-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Shanghai</p>
              <h4>上海平台分布</h4>
            </div>
            <div className="panel-note">
              总数 {shanghai?.total ?? 0} / 有效 {shanghai?.valid ?? 0}
            </div>
          </div>
          {shSourceOption ? (
            <ReactECharts option={shSourceOption} style={{ height: 340 }} />
          ) : (
            <div className="empty-state">暂无上海分布数据</div>
          )}
        </section>

        <section className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="section-kicker">30 Days</p>
              <h4>近 30 天新增趋势</h4>
            </div>
          </div>
          {shTrendOption ? (
            <ReactECharts option={shTrendOption} style={{ height: 360 }} />
          ) : (
            <div className="empty-state">暂无趋势数据</div>
          )}
        </section>
      </div>
    </section>
  )
}
