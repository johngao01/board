import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../lib/api'
import type {
  UserHeatmapResponse,
  UserMessagesResponse,
  UserReportResponse,
} from '../lib/user-report'

function shiftMonth(month: string, delta: number) {
  const [yearStr, monthStr] = month.split('-')
  const date = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1)
  const year = date.getFullYear()
  const nextMonth = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${nextMonth}`
}

export function UserReportPage() {
  const params = useParams<{ identity: string }>()
  const identity = params.identity ?? ''

  const [report, setReport] = useState<UserReportResponse | null>(null)
  const [messages, setMessages] = useState<UserMessagesResponse['messages']>([])
  const [month, setMonth] = useState('')
  const [heatmap, setHeatmap] = useState<Array<[string, number]>>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [dateFilter, setDateFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [fileFilter, setFileFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadReport() {
      setLoading(true)
      setError(null)

      try {
        const response = await apiGet<UserReportResponse>(
          `/api/user/report?identity=${encodeURIComponent(identity)}`,
        )

        if (cancelled) {
          return
        }

        setReport(response)
        setMessages(response.messages)
        setMonth(response.info.current_month)
        setHeatmap(response.heatmap)
        setCurrentPage(1)
        setTotalPages(response.total_pages || 1)
        setDateFilter(null)
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : '用户报告加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (identity) {
      void loadReport()
    }

    return () => {
      cancelled = true
    }
  }, [identity])

  async function reloadMessages(targetDate: string | null, nextPage: number) {
    const query = new URLSearchParams({
      identity,
      page: String(nextPage),
    })
    if (targetDate) {
      query.set('date', targetDate)
    }

    const response = await apiGet<UserMessagesResponse>(`/api/user/messages?${query.toString()}`)
    setCurrentPage(nextPage)
    setTotalPages(response.total_pages || 1)

    if (nextPage === 1) {
      setMessages(response.messages)
    } else {
      setMessages((current) => [...current, ...response.messages])
    }
  }

  async function handleMonthChange(delta: number) {
    const nextMonth = shiftMonth(month, delta)
    const response = await apiGet<UserHeatmapResponse>(
      `/api/user/heatmap?identity=${encodeURIComponent(identity)}&month=${nextMonth}`,
    )
    setMonth(nextMonth)
    setHeatmap(response.data)
  }

  const heatmapOption = useMemo(() => {
    if (!month) {
      return undefined
    }

    const [year, monthNumber] = month.split('-').map(Number)
    const lastDay = new Date(year, monthNumber, 0).getDate()
    const rawMap = new Map(heatmap.map(([day, count]) => [day, count]))
    const fullData: Array<[string, number]> = Array.from({ length: lastDay }, (_, index) => {
      const day = `${year}-${`${monthNumber}`.padStart(2, '0')}-${`${index + 1}`.padStart(2, '0')}`
      return [day, rawMap.get(day) ?? 0]
    })

    return {
      backgroundColor: 'transparent',
      tooltip: {
        formatter: (params: { value: [string, number] }) => `${params.value[0]}: ${params.value[1]} 条`,
      },
      visualMap: {
        min: 0,
        max: Math.max(...fullData.map((item) => item[1]), 5),
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        textStyle: { color: 'var(--muted)' },
        inRange: {
          color: ['#22304a', '#155e75', '#0f766e', '#4dd4c6'],
        },
      },
      calendar: {
        top: 30,
        left: 20,
        right: 20,
        bottom: 60,
        range: month,
        cellSize: ['auto', 42],
        dayLabel: { firstDay: 1, nameMap: 'cn', color: 'var(--muted)' },
        monthLabel: { show: false },
        yearLabel: { show: false },
        itemStyle: {
          borderWidth: 3,
          borderColor: 'rgba(127,127,127,0.12)',
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: fullData,
          label: {
            show: true,
            formatter: (params: { value: [string, number] }) => {
              const day = Number(params.value[0].split('-')[2])
              return `${day}\n${params.value[1]}`
            },
            color: '#fff',
            fontSize: 10,
          },
        },
      ],
    }
  }, [heatmap, month])

  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      const matchesSearch =
        !search ||
        Object.values(message).some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
      const matchesPlatform = !platformFilter || message.platform === platformFilter
      const matchesFile = !fileFilter || message.file_type === fileFilter
      return matchesSearch && matchesPlatform && matchesFile
    })
  }, [fileFilter, messages, platformFilter, search])

  const platformPieOption = report
    ? {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { color: 'var(--muted)' } },
        series: [
          {
            type: 'pie',
            radius: ['45%', '72%'],
            center: ['50%', '45%'],
            itemStyle: { borderRadius: 10 },
            data: Object.entries(report.stats.platforms).map(([name, value]) => ({ name, value })),
          },
        ],
      }
    : undefined

  return (
    <section className="page">
      <div className="page-hero">
        <div className="hero-row">
          <div>
            <p className="section-kicker">User Report</p>
            <h3>用户报告页已经迁到 React</h3>
            <p className="section-copy">
              这个页面会展示单个身份下的总体统计、账号维度聚合、活跃日历和历史消息明细。
            </p>
          </div>

          <div className="user-report-header-actions">
            <div className="identity-pill">{identity}</div>
            <Link className="ghost-button" to="/">
              返回主页
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="error-banner">接口加载失败：{error}</div> : null}

      <div className="stats-grid">
        <article className="stat-card">
          <p className="stat-title">总消息数</p>
          <strong className="stat-value">{loading ? '...' : report?.stats.total ?? 0}</strong>
        </article>
        <article className="stat-card">
          <p className="stat-title">作品数</p>
          <strong className="stat-value">{loading ? '...' : report?.stats.works ?? 0}</strong>
        </article>
        <article className="stat-card accent-cyan">
          <p className="stat-title">视频</p>
          <strong className="stat-value">{loading ? '...' : report?.stats.video ?? 0}</strong>
        </article>
        <article className="stat-card accent-gold">
          <p className="stat-title">图片</p>
          <strong className="stat-value">{loading ? '...' : report?.stats.image ?? 0}</strong>
        </article>
      </div>

      <div className="panel-grid">
        <section className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Activity Calendar</p>
              <h4>活跃日历</h4>
            </div>
            <div className="month-switcher">
              <button type="button" className="ghost-button" onClick={() => void handleMonthChange(-1)}>
                上个月
              </button>
              <span className="month-label">{month || '-'}</span>
              <button type="button" className="ghost-button" onClick={() => void handleMonthChange(1)}>
                下个月
              </button>
            </div>
          </div>
          {heatmapOption ? (
            <ReactECharts
              option={heatmapOption}
              style={{ height: 360 }}
              onEvents={{
                click: (params: { componentType?: string; data?: [string, number] }) => {
                  if (params.componentType === 'series' && params.data) {
                    const selectedDate = params.data[0]
                    setDateFilter(selectedDate)
                    void reloadMessages(selectedDate, 1)
                  }
                },
              }}
            />
          ) : (
            <div className="empty-state">暂无热力图数据</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Platforms</p>
              <h4>平台分布</h4>
            </div>
          </div>
          {platformPieOption ? (
            <ReactECharts option={platformPieOption} style={{ height: 340 }} />
          ) : (
            <div className="empty-state">暂无平台分布数据</div>
          )}
        </section>
      </div>

      <div className="panel-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Accounts</p>
              <h4>关联账号维度统计</h4>
            </div>
          </div>
          <div className="account-list">
            {report?.info.accounts_stats.map((account) => (
              <div key={account.userid} className="account-item">
                <div>
                  <strong>{account.username}</strong>
                  <p className="account-meta">
                    {account.platform} · {account.userid}
                  </p>
                </div>
                <div className="account-stats">
                  <span>消息 {account.msg_count}</span>
                  <span>作品 {account.work_count}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Messages</p>
              <h4>历史明细</h4>
            </div>
            <div className="panel-note">
              {dateFilter ? `已筛选 ${dateFilter}` : '未按日期筛选'}
            </div>
          </div>

          <div className="toolbar-mock report-toolbar">
            <input
              className="report-input"
              placeholder="搜索内容 / 用户名 / 链接"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
              <option value="">所有平台</option>
              <option value="微博">微博</option>
              <option value="抖音">抖音</option>
              <option value="Instagram">Instagram</option>
              <option value="B站">B站</option>
            </select>
            <select value={fileFilter} onChange={(event) => setFileFilter(event.target.value)}>
              <option value="">所有类型</option>
              <option value="视频">视频</option>
              <option value="图片">图片</option>
              <option value="文本">文本</option>
            </select>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setSearch('')
                setPlatformFilter('')
                setFileFilter('')
                setDateFilter(null)
                void reloadMessages(null, 1)
              }}
            >
              重置
            </button>
          </div>

          <div className="message-table">
            <div className="message-row message-head">
              <span>时间</span>
              <span>平台</span>
              <span>类型</span>
              <span>用户</span>
              <span>文件名</span>
              <span>描述</span>
            </div>
            {filteredMessages.map((message) => (
              <div key={message.id} className="message-row">
                <span>{message.time}</span>
                <span>{message.platform}</span>
                <span>{message.file_type}</span>
                <span>{message.username}</span>
                <span className="message-text">{message.caption || '-'}</span>
                <span className="message-text">{message.text || message.url}</span>
              </div>
            ))}
          </div>

          <div className="report-footer">
            <span className="panel-note">
              已加载第 {currentPage} / {totalPages} 页，当前显示 {filteredMessages.length} 条
            </span>
            <button
              type="button"
              className="ghost-button"
              disabled={currentPage >= totalPages}
              onClick={() => void reloadMessages(dateFilter, currentPage + 1)}
            >
              {currentPage >= totalPages ? '没有更多了' : '加载更多'}
            </button>
          </div>
        </section>
      </div>
    </section>
  )
}
