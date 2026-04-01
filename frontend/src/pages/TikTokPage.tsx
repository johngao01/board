import { useEffect, useMemo, useState } from 'react'
import { apiGet, formatDateInput } from '../lib/api'
import type { TikTokDashboardState, TiktokMetricResponse } from '../lib/dashboard'

const emptyState: TikTokDashboardState = {
  scraped: null,
  active: null,
  fresh: null,
}

function getTrendClass(value: number) {
  if (value > 0) {
    return 'up'
  }
  if (value < 0) {
    return 'down'
  }
  return 'flat'
}

function getTrendText(value: number) {
  if (value > 0) {
    return `▲ ${value}%`
  }
  if (value < 0) {
    return `▼ ${Math.abs(value)}%`
  }
  return '-'
}

function MetricCard({
  title,
  value,
  previous,
  trend,
}: {
  title: string
  value: string | number
  previous: string | number
  trend: number
}) {
  return (
    <article className="dashboard-card">
      <p className="dashboard-card-title">{title}</p>
      <div className="dashboard-card-value-row">
        <strong className="dashboard-card-value">{value}</strong>
        <span className={`trend-badge ${getTrendClass(trend)}`}>{getTrendText(trend)}</span>
      </div>
      <p className="dashboard-card-meta">昨日 {previous}</p>
    </article>
  )
}

export function TikTokPage() {
  const [date, setDate] = useState(() => formatDateInput(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TikTokDashboardState>(emptyState)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const [scraped, active, fresh] = await Promise.all([
          apiGet<TiktokMetricResponse>(`/api/tiktok/scraped?date=${date}`),
          apiGet<TiktokMetricResponse>(`/api/tiktok/active?date=${date}`),
          apiGet<TiktokMetricResponse>(`/api/tiktok/new?date=${date}`),
        ])

        if (cancelled) {
          return
        }

        setData({ scraped, active, fresh })
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : '加载失败')
          setData(emptyState)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [date])

  const avg = useMemo(() => {
    const scraped = data.scraped?.val ?? 0
    const active = data.active?.val ?? 0
    if (!active) {
      return 0
    }
    return Number((scraped / active).toFixed(1))
  }, [data.active?.val, data.scraped?.val])

  return (
    <section className="page">
      <div className="page-hero">
        <div className="hero-row">
          <div>
            <p className="section-kicker">TikTok Dashboard</p>
            <h3>TikTok Bot 统计信息</h3>
            <p className="section-copy">TikTok 指标已从首页拆分，单独放在这个页面展示。</p>
          </div>

          <label className="date-field">
            <span>统计日期</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>
      </div>

      {error ? <div className="error-banner">接口加载失败：{error}</div> : null}

      <div className="dashboard-card-grid">
        <MetricCard
          title="当天爬取 Aweme"
          value={loading ? '...' : data.scraped?.val ?? 0}
          previous={data.scraped?.prev ?? 0}
          trend={data.scraped?.trend ?? 0}
        />
        <MetricCard
          title="活跃用户"
          value={loading ? '...' : data.active?.val ?? 0}
          previous={data.active?.prev ?? 0}
          trend={data.active?.trend ?? 0}
        />
        <MetricCard
          title="新增用户"
          value={loading ? '...' : data.fresh?.val ?? 0}
          previous={data.fresh?.prev ?? 0}
          trend={data.fresh?.trend ?? 0}
        />
        <MetricCard title="人均采集" value={loading ? '...' : avg} previous="-" trend={0} />
      </div>
    </section>
  )
}
