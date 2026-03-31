import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { apiGet, formatDateInput } from '../lib/api'
import type {
  MessageListResponse,
  NicemeResponse,
  TiktokMetricResponse,
  WorksDistResponse,
} from '../lib/dashboard'

type DashboardState = {
  niceme: NicemeResponse['data'] | null
  works: WorksDistResponse | null
  messages: MessageListResponse['data']
  tiktok: {
    scraped: TiktokMetricResponse | null
    active: TiktokMetricResponse | null
    fresh: TiktokMetricResponse | null
  }
}

const emptyState: DashboardState = {
  niceme: null,
  works: null,
  messages: [],
  tiktok: {
    scraped: null,
    active: null,
    fresh: null,
  },
}

function TrendPill({ value, previous }: { value: number; previous: number | string }) {
  if (!value) {
    return <span className="trend-pill neutral">持平 · 对比 {previous}</span>
  }

  const positive = value > 0
  return (
    <span className={`trend-pill ${positive ? 'up' : 'down'}`}>
      {positive ? '上涨' : '下降'} {Math.abs(value)}% · 对比 {previous}
    </span>
  )
}

function MiniMetric({
  label,
  metric,
}: {
  label: string
  metric: TiktokMetricResponse | null
}) {
  return (
    <article className="stat-card">
      <p className="stat-title">{label}</p>
      <strong className="stat-value">{metric?.val ?? '-'}</strong>
      <p className="stat-copy">昨日 {metric?.prev ?? '-'}，趋势 {metric?.trend ?? 0}%</p>
    </article>
  )
}

export function DashboardPage() {
  const [date, setDate] = useState(() => formatDateInput(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardState>(emptyState)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError(null)

      try {
        const [nicemeRes, worksRes, messagesRes, scrapedRes, activeRes, newRes] =
          await Promise.all([
            apiGet<NicemeResponse>(`/api/niceme?date=${date}`),
            apiGet<WorksDistResponse>(`/api/niceme/works_dist?date=${date}`),
            apiGet<MessageListResponse>(`/api/list/niceme_messages?date=${date}`),
            apiGet<TiktokMetricResponse>(`/api/tiktok/scraped?date=${date}`),
            apiGet<TiktokMetricResponse>(`/api/tiktok/active?date=${date}`),
            apiGet<TiktokMetricResponse>(`/api/tiktok/new?date=${date}`),
          ])

        if (cancelled) {
          return
        }

        setData({
          niceme: nicemeRes.data,
          works: worksRes,
          messages: messagesRes.data,
          tiktok: {
            scraped: scrapedRes,
            active: activeRes,
            fresh: newRes,
          },
        })
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

    void loadDashboard()

    return () => {
      cancelled = true
    }
  }, [date])

  const niceme = data.niceme
  const works = data.works

  const messagePieOption = niceme
    ? {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        legend: {
          bottom: 0,
          textStyle: { color: 'var(--muted)' },
        },
        series: [
          {
            type: 'pie',
            radius: ['54%', '76%'],
            center: ['50%', '45%'],
            itemStyle: { borderRadius: 10, borderColor: 'transparent', borderWidth: 4 },
            label: { color: 'inherit' },
            data: Object.entries(niceme.msg_platforms).map(([name, value]) => ({
              name,
              value,
            })),
          },
        ],
      }
    : undefined

  const trendOption = niceme
    ? {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: {
          top: 0,
          textStyle: { color: 'var(--muted)' },
        },
        grid: { left: 20, right: 20, top: 46, bottom: 20, containLabel: true },
        xAxis: {
          type: 'category',
          data: niceme.history.dates,
          axisLabel: { color: 'var(--muted)' },
          axisLine: { lineStyle: { color: 'rgba(127,127,127,0.2)' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: 'var(--muted)' },
          splitLine: { lineStyle: { color: 'rgba(127,127,127,0.15)' } },
        },
        series: [
          {
            name: '消息',
            type: 'bar',
            data: niceme.history.msgs,
            itemStyle: { color: '#4dd4c6' },
          },
          {
            name: '作品',
            type: 'bar',
            data: niceme.history.works,
            itemStyle: { color: '#e8bb52' },
          },
          {
            name: '用户',
            type: 'line',
            smooth: true,
            data: niceme.history.users,
            itemStyle: { color: '#f07d97' },
            lineStyle: { width: 3 },
          },
        ],
      }
    : undefined

  const worksOption = works
    ? {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        legend: {
          bottom: 0,
          textStyle: { color: 'var(--muted)' },
        },
        series: [
          {
            type: 'pie',
            radius: ['28%', '46%'],
            center: ['50%', '46%'],
            label: { formatter: '{b}\n{c}' },
            data: Object.entries(works.platforms).map(([name, value]) => ({ name, value })),
          },
          {
            type: 'pie',
            radius: ['56%', '76%'],
            center: ['50%', '46%'],
            label: { formatter: '{b}\n{c}' },
            data: Object.entries(works.types).map(([name, value]) => ({ name, value })),
          },
        ],
      }
    : undefined

  return (
    <section className="page">
      <div className="page-hero">
        <div className="hero-row">
          <div>
            <p className="section-kicker">Homepage</p>
            <h3>主页已经开始接真实数据</h3>
            <p className="section-copy">
              这版先把旧 Flask 模板里的核心接口搬进 React：首页 KPI、TikTok 指标、消息分布、作品分布、七日趋势和消息列表。
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
        <article className="stat-card">
          <p className="stat-title">消息总量</p>
          <strong className="stat-value">{loading ? '...' : niceme?.total ?? 0}</strong>
          <p className="stat-copy">昨日 {niceme?.total_prev ?? 0}</p>
          <TrendPill value={niceme?.total_trend ?? 0} previous={niceme?.total_prev ?? 0} />
        </article>
        <article className="stat-card">
          <p className="stat-title">活跃用户</p>
          <strong className="stat-value">{loading ? '...' : niceme?.users ?? 0}</strong>
          <p className="stat-copy">昨日 {niceme?.users_prev ?? 0}</p>
          <TrendPill value={niceme?.users_trend ?? 0} previous={niceme?.users_prev ?? 0} />
        </article>
        <article className="stat-card">
          <p className="stat-title">作品数</p>
          <strong className="stat-value">{loading ? '...' : niceme?.works ?? 0}</strong>
          <p className="stat-copy">昨日 {niceme?.works_prev ?? 0}</p>
          <TrendPill value={niceme?.works_trend ?? 0} previous={niceme?.works_prev ?? 0} />
        </article>
        <article className="stat-card">
          <p className="stat-title">文件分布</p>
          <strong className="stat-value compact">
            {loading ? '...' : `${niceme?.files.video ?? 0} / ${niceme?.files.image ?? 0}`}
          </strong>
          <p className="stat-copy">视频 / 图片，昨日 {niceme?.files_prev_str ?? '0/0'}</p>
          <TrendPill value={niceme?.files_trend ?? 0} previous={niceme?.files_prev_str ?? '0/0'} />
        </article>
      </div>

      <div className="panel-grid dashboard-top-grid">
        <section className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="section-kicker">NiceBot</p>
              <h4>消息分布</h4>
            </div>
          </div>
          {messagePieOption ? (
            <ReactECharts option={messagePieOption} style={{ height: 340 }} />
          ) : (
            <div className="empty-state">暂无消息分布数据</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">TikTok Bot</p>
              <h4>当天指标</h4>
            </div>
          </div>
          <div className="mini-metrics">
            <MiniMetric label="采集量" metric={data.tiktok.scraped} />
            <MiniMetric label="活跃会话" metric={data.tiktok.active} />
            <MiniMetric label="新增用户" metric={data.tiktok.fresh} />
          </div>
        </section>
      </div>

      <div className="panel-grid">
        <section className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Trend</p>
              <h4>近七天趋势</h4>
            </div>
          </div>
          {trendOption ? (
            <ReactECharts option={trendOption} style={{ height: 360 }} />
          ) : (
            <div className="empty-state">暂无趋势数据</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Works</p>
              <h4>作品分布</h4>
            </div>
          </div>
          {worksOption ? (
            <>
              <div className="panel-note">今日作品 {works?.total ?? 0}，昨日类型分布 {works?.prev_str}</div>
              <ReactECharts option={worksOption} style={{ height: 340 }} />
            </>
          ) : (
            <div className="empty-state">暂无作品分布数据</div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="section-kicker">Messages</p>
            <h4>最新消息明细</h4>
          </div>
          <div className="panel-note">{loading ? '加载中...' : `共 ${data.messages.length} 条`}</div>
        </div>

        <div className="message-table">
          <div className="message-row message-head">
            <span>时间</span>
            <span>用户</span>
            <span>平台</span>
            <span>类型</span>
            <span>文件</span>
            <span>内容</span>
          </div>
          {data.messages.slice(0, 12).map((message) => (
            <div key={message.id} className="message-row">
              <span>{message.time}</span>
              <span>{message.username}</span>
              <span>{message.platform}</span>
              <span>{message.type}</span>
              <span>{message.file_type}</span>
              <span className="message-text">
                {message.text || message.caption || message.url}
              </span>
            </div>
          ))}
          {!loading && data.messages.length === 0 ? (
            <div className="empty-state table-empty">当前日期没有消息数据</div>
          ) : null}
        </div>
      </section>
    </section>
  )
}
