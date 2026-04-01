import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { useParams } from 'react-router-dom'
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

function formatMonthLabel(month: string) {
  if (!month) {
    return '-'
  }

  const [year, monthNumber] = month.split('-')
  return `${year}年${monthNumber}月`
}

function platformMark(platform: string) {
  switch (platform) {
    case '微博':
      return 'W'
    case '抖音':
      return 'D'
    case 'Instagram':
      return 'IG'
    case 'B站':
      return 'B'
    default:
      return '?'
  }
}

function typeClassName(fileType: string) {
  if (fileType === '关注') {
    return 'table-badge type-follow'
  }

  if (fileType === '喜欢') {
    return 'table-badge type-like'
  }

  return 'table-badge'
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
  const [topSectionCollapsed, setTopSectionCollapsed] = useState(false)
  const [tableSectionCollapsed, setTableSectionCollapsed] = useState(false)
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
        orient: 'vertical',
        right: 8,
        top: 'middle',
        itemHeight: 130,
        text: ['高', '低'],
        textStyle: { color: '#8ea3bf' },
        inRange: {
          color: ['#202845', '#18456e', '#0c6ec9', '#00d7ff'],
        },
      },
      calendar: {
        top: 44,
        left: 26,
        right: 58,
        bottom: 44,
        range: month,
        splitLine: {
          show: true,
          lineStyle: {
            color: 'rgba(18, 24, 38, 0.95)',
            width: 2,
          },
        },
        cellSize: ['auto', 56],
        dayLabel: {
          firstDay: 1,
          nameMap: 'cn',
          color: '#91a6c2',
          fontSize: 13,
          margin: 14,
        },
        monthLabel: { show: false },
        yearLabel: { show: false },
        itemStyle: {
          color: '#1c2440',
          borderColor: '#121826',
          borderWidth: 2,
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
              return `${day}号  ${params.value[1]}个`
            },
            color: '#f7fbff',
            fontSize: 11,
            fontWeight: 700,
          },
          emphasis: {
            label: {
              color: '#ffffff',
            },
            itemStyle: {
              shadowBlur: 12,
              shadowColor: 'rgba(0, 234, 255, 0.38)',
            },
          },
        },
      ],
    }
  }, [heatmap, month])

  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      const matchesSearch =
        !search ||
        [
          message.id,
          message.username,
          message.text,
          message.url,
          message.caption,
          message.platform,
          message.file_type,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())
      const matchesPlatform = !platformFilter || message.platform === platformFilter
      const matchesFile = !fileFilter || message.file_type === fileFilter
      return matchesSearch && matchesPlatform && matchesFile
    })
  }, [fileFilter, messages, platformFilter, search])

  const platformOptions = useMemo(() => {
    const values = new Set(messages.map((message) => message.platform).filter(Boolean))
    return Array.from(values)
  }, [messages])

  const fileOptions = useMemo(() => {
    const values = new Set(messages.map((message) => message.file_type).filter(Boolean))
    return Array.from(values)
  }, [messages])

  return (
    <section className="page user-report-page">
      {error ? <div className="error-banner">接口加载失败：{error}</div> : null}

      <section className="dashboard-section">
        <button
          type="button"
          className={`section-header theme-nice${topSectionCollapsed ? ' is-collapsed' : ''}`}
          onClick={() => setTopSectionCollapsed((current) => !current)}
        >
          <div className="section-title-group">
            <span className="drag-handle">⠿</span>
            <span className="section-title">活跃度日历 & 账号分布统计</span>
            <span className="identity-pill identity-pill-inline">{identity}</span>
          </div>
          <span className="toggle-icon">▾</span>
        </button>

        {!topSectionCollapsed ? (
          <div className="section-content user-report-section-content">
            <div className="stats-grid user-report-stats-grid">
              <article className="dashboard-card">
                <p className="dashboard-card-title">总计消息</p>
                <strong className="dashboard-card-value">{loading ? '...' : report?.stats.total ?? 0}</strong>
              </article>
              <article className="dashboard-card">
                <p className="dashboard-card-title">作品数量</p>
                <strong className="dashboard-card-value">{loading ? '...' : report?.stats.works ?? 0}</strong>
              </article>
              <article className="dashboard-card accent-green">
                <p className="dashboard-card-title">视频数量</p>
                <strong className="dashboard-card-value user-report-accent-green">
                  {loading ? '...' : report?.stats.video ?? 0}
                </strong>
              </article>
              <article className="dashboard-card accent-gold">
                <p className="dashboard-card-title">图片数量</p>
                <strong className="dashboard-card-value user-report-accent-gold">
                  {loading ? '...' : report?.stats.image ?? 0}
                </strong>
              </article>
            </div>

            <div className="user-report-top-grid">
              <article className="panel user-report-panel user-report-panel-wide">
                <div className="user-report-panel-head">
                  <h4>活跃日历</h4>
                  <div className="month-switcher user-report-month-switcher">
                    <button
                      type="button"
                      className="header-button"
                      onClick={() => void handleMonthChange(-1)}
                    >
                      ‹
                    </button>
                    <span className="user-report-month-label">{formatMonthLabel(month)}</span>
                    <button
                      type="button"
                      className="header-button"
                      onClick={() => void handleMonthChange(1)}
                    >
                      ›
                    </button>
                  </div>
                </div>
                {heatmapOption ? (
                  <ReactECharts
                    option={heatmapOption}
                    style={{ height: 440 }}
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
              </article>

              <article className="panel user-report-panel">
                <div className="user-report-panel-head">
                  <h4>关联账号维度统计</h4>
                  <span className="panel-note">
                    共 {report?.info.accounts_stats.length ?? 0} 个账号
                  </span>
                </div>
                <div className="dashboard-table-shell user-report-account-shell">
                  <div className="dashboard-table-scroll user-report-account-scroll">
                    <table className="dashboard-table user-report-account-table">
                      <thead>
                        <tr>
                          <th>账号信息</th>
                          <th>消息数</th>
                          <th>作品数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report?.info.accounts_stats.map((account) => (
                          <tr key={account.userid}>
                            <td>
                              <div className="user-report-account-main">
                                <span className="user-report-platform-icon">
                                  {platformMark(account.platform)}
                                </span>
                                <div className="user-report-account-copy">
                                  <strong>{account.username}</strong>
                                  <span>{account.userid}</span>
                                </div>
                              </div>
                            </td>
                            <td className="user-report-metric user-report-metric-cyan">
                              {account.msg_count}
                            </td>
                            <td className="user-report-metric user-report-metric-gold">
                              {account.work_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </article>
            </div>
          </div>
        ) : null}
      </section>

      <section className="dashboard-section">
        <button
          type="button"
          className={`section-header theme-table${tableSectionCollapsed ? ' is-collapsed' : ''}`}
          onClick={() => setTableSectionCollapsed((current) => !current)}
        >
          <div className="section-title-group">
            <span className="drag-handle">⠿</span>
            <span className="section-title">详细历史记录</span>
          </div>
          <span className="toggle-icon">▾</span>
        </button>

        {!tableSectionCollapsed ? (
          <div className="section-content user-report-section-content">
            <div className="dashboard-toolbar">
              <label className="dashboard-search">
                <span className="toolbar-icon">⌕</span>
                <input
                  placeholder="搜索 ID / 用户名 / 描述 / 链接"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                <option value="">所有平台</option>
                {platformOptions.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
              <select value={fileFilter} onChange={(event) => setFileFilter(event.target.value)}>
                <option value="">所有类型</option>
                {fileOptions.map((fileType) => (
                  <option key={fileType} value={fileType}>
                    {fileType}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="reset-button"
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

            <div className="dashboard-table-shell">
              <div className="dashboard-table-scroll">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th className="col-no">序号</th>
                      <th>ID</th>
                      <th>时间</th>
                      <th>平台</th>
                      <th>类型</th>
                      <th>用户名</th>
                      <th>文件名</th>
                      <th>描述详情</th>
                      <th>源链接</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMessages.length ? (
                      filteredMessages.map((message, index) => (
                        <tr key={`${message.id}-${index}`}>
                          <td className="col-no">{index + 1}</td>
                          <td className="col-id">{message.id}</td>
                          <td className="col-time">{message.time}</td>
                          <td>{message.platform}</td>
                          <td>
                            <span className={typeClassName(message.file_type)}>{message.file_type}</span>
                          </td>
                          <td>
                            <a
                              className="user-link"
                              href={`/user/${encodeURIComponent(message.username)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {message.username}
                            </a>
                          </td>
                          <td className="col-file">{message.caption || '-'}</td>
                          <td className="col-description user-report-description-cell">
                            {message.text || '-'}
                          </td>
                          <td className="col-link">
                            {message.url ? (
                              <a className="table-link" href={message.url} target="_blank" rel="noreferrer">
                                {message.url}
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9}>
                          <div className="table-empty-state">暂无符合筛选条件的数据</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dashboard-table-footer user-report-table-footer">
                <span>
                  {dateFilter ? `当前按 ${dateFilter} 筛选，` : ''}
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
            </div>
          </div>
        ) : null}
      </section>
    </section>
  )
}
