import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { apiGet, formatDateInput } from '../lib/api'
import { useChartTheme } from '../lib/chart-theme'
import type {
  MessageListResponse,
  NicemeResponse,
  WorksDistResponse,
} from '../lib/dashboard'

type DashboardState = {
  niceme: NicemeResponse['data'] | null
  works: WorksDistResponse | null
  messages: MessageListResponse['data']
}

type TopSectionId = 'nice' | 'tiktok' | 'table'
type NiceSubSectionId = 'cards' | 'charts'
type NiceCardId = 'total' | 'users' | 'works' | 'files'
type NiceChartId = 'messages' | 'works' | 'history'
type SortColumn = 'id' | 'time' | 'platform' | 'type' | 'username' | 'fileName' | 'description'
type SortDirection = 'asc' | 'desc'

type Filters = {
  search: string
  platform: string
  type: string
  fileType: string
}

type CollapsedState = Record<string, boolean>
type DragState<T extends string> = {
  type: 'top' | 'nice-sub' | 'nice-card' | 'nice-chart'
  id: T
}

const emptyState: DashboardState = {
  niceme: null,
  works: null,
  messages: [],
}

const topSectionDefaults: TopSectionId[] = ['nice', 'table']
const niceSubDefaults: NiceSubSectionId[] = ['cards', 'charts']
const niceCardDefaults: NiceCardId[] = ['total', 'users', 'works', 'files']
const niceChartDefaults: NiceChartId[] = ['messages', 'works', 'history']
const defaultFilters: Filters = { search: '', platform: '', type: '', fileType: '' }

function readStoredOrder<T extends string>(storageKey: string, defaults: readonly T[]) {
  const raw = localStorage.getItem(storageKey)
  if (!raw) {
    return [...defaults]
  }

  try {
    const parsed = JSON.parse(raw) as T[]
    const whitelist = new Set(defaults)
    const filtered = parsed.filter((item) => whitelist.has(item))
    const missing = defaults.filter((item) => !filtered.includes(item))
    return filtered.length > 0 ? [...filtered, ...missing] : [...defaults]
  } catch {
    return [...defaults]
  }
}

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return items
  }

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function extractFileName(message: MessageListResponse['data'][number]) {
  if (message.caption) {
    return message.caption
  }

  return ''
}

function getDescription(message: MessageListResponse['data'][number]) {
  return message.text || '-'
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

function compareValue(left: string | number, right: string | number, direction: SortDirection) {
  const result =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'zh-CN')
  return direction === 'asc' ? result : -result
}

function DashboardMetricCard({
  title,
  value,
  previous,
  trend,
  accent,
}: {
  title: string
  value: string | number
  previous: string | number
  trend: number
  accent?: 'cyan' | 'green' | 'gold' | 'purple'
}) {
  return (
    <article className={`dashboard-card ${accent ? `accent-${accent}` : ''}`}>
      <p className="dashboard-card-title">{title}</p>
      <div className="dashboard-card-value-row">
        <strong className="dashboard-card-value">{value}</strong>
        <span className={`trend-badge ${getTrendClass(trend)}`}>{getTrendText(trend)}</span>
      </div>
      <p className="dashboard-card-meta">昨日 {previous}</p>
    </article>
  )
}

function SortableWrap<T extends string>({
  id,
  dragType,
  onDragStart,
  onDrop,
  className,
  draggable = true,
  children,
}: {
  id: T
  dragType: DragState<T>['type']
  onDragStart: (state: DragState<T>) => void
  onDrop: (targetId: T) => void
  className?: string
  draggable?: boolean
  children: ReactNode
}) {
  return (
    <div
      draggable={draggable}
      className={className}
      onDragStart={draggable ? () => onDragStart({ type: dragType, id }) : undefined}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(id)}
    >
      {children}
    </div>
  )
}

export function DashboardPage() {
  const chartTheme = useChartTheme()
  const [date, setDate] = useState(() => localStorage.getItem('dashboard-date') || formatDateInput(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardState>(emptyState)
  const [topSections, setTopSections] = useState<TopSectionId[]>(() =>
    readStoredOrder('dashboard-top-sections', topSectionDefaults),
  )
  const [niceSubSections, setNiceSubSections] = useState<NiceSubSectionId[]>(() =>
    readStoredOrder('dashboard-nice-subsections', niceSubDefaults),
  )
  const [niceCards, setNiceCards] = useState<NiceCardId[]>(() =>
    readStoredOrder('dashboard-nice-cards', niceCardDefaults),
  )
  const [niceCharts, setNiceCharts] = useState<NiceChartId[]>(() =>
    readStoredOrder('dashboard-nice-charts', niceChartDefaults),
  )
  const [collapsed, setCollapsed] = useState<CollapsedState>(() => {
    try {
      return JSON.parse(localStorage.getItem('dashboard-collapsed') || '{}') as CollapsedState
    } catch {
      return {}
    }
  })
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      return { ...defaultFilters, ...(JSON.parse(localStorage.getItem('dashboard-filters') || '{}') as Filters) }
    } catch {
      return defaultFilters
    }
  })
  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [dragState, setDragState] = useState<DragState<string> | null>(null)

  useEffect(() => {
    localStorage.setItem('dashboard-date', date)
  }, [date])

  useEffect(() => {
    localStorage.setItem('dashboard-top-sections', JSON.stringify(topSections))
  }, [topSections])

  useEffect(() => {
    localStorage.setItem('dashboard-nice-subsections', JSON.stringify(niceSubSections))
  }, [niceSubSections])

  useEffect(() => {
    localStorage.setItem('dashboard-nice-cards', JSON.stringify(niceCards))
  }, [niceCards])

  useEffect(() => {
    localStorage.setItem('dashboard-nice-charts', JSON.stringify(niceCharts))
  }, [niceCharts])

  useEffect(() => {
    localStorage.setItem('dashboard-collapsed', JSON.stringify(collapsed))
  }, [collapsed])

  useEffect(() => {
    localStorage.setItem('dashboard-filters', JSON.stringify(filters))
  }, [filters])

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError(null)

      try {
        const [nicemeRes, worksRes, messagesRes] = await Promise.all([
          apiGet<NicemeResponse>(`/api/niceme?date=${date}`),
          apiGet<WorksDistResponse>(`/api/niceme/works_dist?date=${date}`),
          apiGet<MessageListResponse>(`/api/list/niceme_messages?date=${date}`),
        ])

        if (cancelled) {
          return
        }

        setData({
          niceme: nicemeRes.status === 'success' ? nicemeRes.data : null,
          works: worksRes,
          messages: messagesRes.data ?? [],
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
  const chartText = chartTheme.text
  const chartMuted = chartTheme.muted
  const chartGrid = chartTheme.grid
  const chartPanel = chartTheme.panel

  const messageChartOption = useMemo<EChartsOption | undefined>(() => {
    if (!niceme) {
      return undefined
    }

    return {
      backgroundColor: 'transparent',
      title: [
        {
          text: '消息分布',
          left: 'center',
          top: 8,
          textStyle: { color: chartText, fontSize: 18, fontWeight: 'bold' },
        },
        {
          text: String(niceme.total),
          subtext: '今日消息',
          left: 'center',
          top: '46%',
          textStyle: { color: chartText, fontSize: 30, fontWeight: 'bold' },
          subtextStyle: { color: chartMuted, fontSize: 14 },
        },
      ],
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 0,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: chartMuted },
      },
      color: ['#4f91ff', '#7af5ab', '#ffe06b', '#ff6978', '#00f2ff'],
      series: [
        {
          type: 'pie',
          left: '6%',
          right: '6%',
          top: '14%',
          bottom: '16%',
          radius: ['48%', '68%'],
          center: ['50%', '54%'],
          itemStyle: { borderRadius: 4 },
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}\n{c}',
            color: chartText,
            fontSize: 14,
            fontWeight: 'bold',
            edgeDistance: 14,
            bleedMargin: 6,
          },
          labelLine: {
            show: true,
            length: 18,
            length2: 14,
            lineStyle: { color: chartMuted },
          },
          labelLayout: {
            hideOverlap: false,
            moveOverlap: 'shiftY',
          },
          data: Object.entries(niceme.msg_platforms || {}).map(([name, value]) => ({ name, value })),
        },
      ],
    }
  }, [chartMuted, chartText, niceme])

  const worksChartOption = useMemo<EChartsOption | undefined>(() => {
    if (!works) {
      return undefined
    }

    return {
      backgroundColor: 'transparent',
      title: [
        {
          text: '作品分布',
          left: 'center',
          top: 8,
          textStyle: { color: chartText, fontSize: 18, fontWeight: 'bold' },
        },
        {
          text: String(works.total),
          subtext: '今日作品',
          left: 'center',
          top: '46%',
          textStyle: {
            color: chartText,
            fontSize: 30,
            fontWeight: 'bold',
          },
          subtextStyle: { color: chartMuted, fontSize: 14 },
        },
      ],
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: {
        bottom: 0,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: chartMuted, fontSize: 11 },
      },
      series: [
        {
          name: '平台',
          type: 'pie',
          left: '6%',
          right: '6%',
          top: '14%',
          bottom: '16%',
          radius: ['32%', '46%'],
          center: ['50%', '53%'],
          itemStyle: { borderRadius: 4 },
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}\n{c}',
            color: chartText,
            alignTo: 'edge',
            edgeDistance: 14,
            margin: 8,
            bleedMargin: 6,
          },
          labelLine: {
            show: true,
            length: 18,
            length2: 8,
            lineStyle: { color: chartMuted },
          },
          labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
          data: Object.entries(works.platforms).map(([name, value]) => ({ name, value })),
        },
        {
          name: '类型',
          type: 'pie',
          left: '6%',
          right: '6%',
          top: '14%',
          bottom: '16%',
          radius: ['52%', '66%'],
          center: ['50%', '53%'],
          itemStyle: { borderRadius: 4 },
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}\n{c}',
            color: chartText,
            fontWeight: 'bold',
            alignTo: 'edge',
            edgeDistance: 14,
            margin: 16,
            bleedMargin: 6,
          },
          labelLine: {
            show: true,
            length: 18,
            length2: 8,
            lineStyle: { color: chartMuted },
          },
          labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
          data: [
            { name: '关注', value: works.types['关注'] || 0, itemStyle: { color: '#16f2a3' } },
            { name: '喜欢', value: works.types['喜欢'] || 0, itemStyle: { color: '#ffc400' } },
          ],
        },
      ],
    }
  }, [chartMuted, chartText, works])

  const historyChartOption = useMemo<EChartsOption | undefined>(() => {
    if (!niceme) {
      return undefined
    }

    return {
      backgroundColor: 'transparent',
      title: {
        text: '近七天趋势',
        left: 'center',
        top: 8,
        textStyle: { color: chartText, fontSize: 18, fontWeight: 'bold' },
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        top: 18,
        right: 12,
        textStyle: { color: chartMuted },
      },
      grid: { left: '4%', right: '3%', top: '20%', bottom: '8%', containLabel: true },
      xAxis: {
        type: 'category',
        data: niceme.history.dates,
        axisLabel: { color: chartMuted },
        axisLine: { lineStyle: { color: chartGrid } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: chartMuted },
        splitLine: { lineStyle: { color: chartGrid } },
      },
      series: [
        {
          name: '消息',
          type: 'bar',
          data: niceme.history.msgs,
          itemStyle: { color: '#12dff4' },
          label: { show: true, position: 'top', color: '#12dff4', fontWeight: 'bold' },
        },
        {
          name: '作品',
          type: 'bar',
          data: niceme.history.works,
          itemStyle: { color: '#16f2a3' },
          label: { show: true, position: 'top', color: '#16f2a3', fontWeight: 'bold' },
        },
        {
          name: '用户',
          type: 'bar',
          data: niceme.history.users,
          itemStyle: { color: '#b700ff' },
          label: { show: true, position: 'top', color: '#b700ff', fontWeight: 'bold' },
        },
      ],
    }
  }, [chartGrid, chartMuted, chartText, niceme])

  const platformOptions = useMemo(
    () =>
      Array.from(
        new Set(
          data.messages
            .map((message) => message.platform)
            .filter((platform): platform is string => Boolean(platform)),
        ),
      ),
    [data.messages],
  )

  const filteredMessages = useMemo(() => {
    const keyword = filters.search.trim().toLowerCase()
    const rows = data.messages.filter((message) => {
      const matchesSearch =
        !keyword ||
        String(message.id).includes(keyword) ||
        message.username.toLowerCase().includes(keyword) ||
        getDescription(message).toLowerCase().includes(keyword) ||
        message.url.toLowerCase().includes(keyword)

      return (
        matchesSearch &&
        (!filters.platform || message.platform === filters.platform) &&
        (!filters.type || message.type === filters.type) &&
        (!filters.fileType || message.file_type === filters.fileType)
      )
    })

    return [...rows].sort((left, right) => {
      switch (sortColumn) {
        case 'id':
          return compareValue(left.id, right.id, sortDirection)
        case 'time':
          return compareValue(left.time, right.time, sortDirection)
        case 'platform':
          return compareValue(left.platform, right.platform, sortDirection)
        case 'type':
          return compareValue(left.type, right.type, sortDirection)
        case 'username':
          return compareValue(left.username, right.username, sortDirection)
        case 'fileName':
          return compareValue(extractFileName(left), extractFileName(right), sortDirection)
        case 'description':
          return compareValue(getDescription(left), getDescription(right), sortDirection)
        default:
          return 0
      }
    })
  }, [data.messages, filters, sortColumn, sortDirection])

  function updateFilters(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  function toggleSection(id: string) {
    setCollapsed((current) => ({
      ...current,
      [id]: !current[id],
    }))
  }

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortColumn(column)
    setSortDirection('desc')
  }

  function handleFilterToTable(patch: Partial<Filters>) {
    setCollapsed((current) => ({ ...current, table: false }))
    updateFilters(patch)
  }

  function adjustDate(days: number) {
    const target = new Date(`${date}T00:00:00`)
    target.setDate(target.getDate() + days)
    setDate(formatDateInput(target))
  }

  function resetFilters() {
    setFilters(defaultFilters)
  }

  function dropTopSection(targetId: TopSectionId) {
    if (!dragState || dragState.type !== 'top') {
      return
    }

    setTopSections((current) =>
      reorderItems(current, current.indexOf(dragState.id as TopSectionId), current.indexOf(targetId)),
    )
    setDragState(null)
  }

  function dropNiceSubSection(targetId: NiceSubSectionId) {
    if (!dragState || dragState.type !== 'nice-sub') {
      return
    }

    setNiceSubSections((current) =>
      reorderItems(current, current.indexOf(dragState.id as NiceSubSectionId), current.indexOf(targetId)),
    )
    setDragState(null)
  }

  function dropNiceCard(targetId: NiceCardId) {
    if (!dragState || dragState.type !== 'nice-card') {
      return
    }

    setNiceCards((current) =>
      reorderItems(current, current.indexOf(dragState.id as NiceCardId), current.indexOf(targetId)),
    )
    setDragState(null)
  }

  function dropNiceChart(targetId: NiceChartId) {
    if (!dragState || dragState.type !== 'nice-chart') {
      return
    }

    setNiceCharts((current) =>
      reorderItems(current, current.indexOf(dragState.id as NiceChartId), current.indexOf(targetId)),
    )
    setDragState(null)
  }

  const niceCardMap: Record<NiceCardId, ReactNode> = {
    total: (
      <DashboardMetricCard
        title="消息总数"
        value={loading ? '...' : niceme?.total ?? 0}
        previous={niceme?.total_prev ?? 0}
        trend={niceme?.total_trend ?? 0}
        accent="cyan"
      />
    ),
    users: (
      <DashboardMetricCard
        title="用户数量"
        value={loading ? '...' : niceme?.users ?? 0}
        previous={niceme?.users_prev ?? 0}
        trend={niceme?.users_trend ?? 0}
        accent="purple"
      />
    ),
    works: (
      <DashboardMetricCard
        title="作品数量"
        value={loading ? '...' : niceme?.works ?? 0}
        previous={niceme?.works_prev ?? 0}
        trend={niceme?.works_trend ?? 0}
        accent="green"
      />
    ),
    files: (
      <article className="dashboard-card dashboard-card-files">
        <p className="dashboard-card-title">视频 / 图片</p>
        <div className="dashboard-card-value-row">
          <strong className="dashboard-card-value">
            <button
              type="button"
              className="inline-metric-button"
              onClick={() => handleFilterToTable({ fileType: '视频' })}
            >
              {loading ? '...' : niceme?.files.video ?? 0}
            </button>
            <span className="slash-divider">/</span>
            <button
              type="button"
              className="inline-metric-button"
              onClick={() => handleFilterToTable({ fileType: '图片' })}
            >
              {loading ? '...' : niceme?.files.image ?? 0}
            </button>
          </strong>
          <span className={`trend-badge ${getTrendClass(niceme?.files_trend ?? 0)}`}>
            {getTrendText(niceme?.files_trend ?? 0)}
          </span>
        </div>
        <p className="dashboard-card-meta">昨日 {niceme?.files_prev_str ?? '0 / 0'}</p>
      </article>
    ),
  }

  const niceChartMap: Record<NiceChartId, ReactNode> = {
    messages: (
      <section className="chart-card chart-card-small" style={{ backgroundColor: chartPanel }}>
        {messageChartOption ? (
          <ReactECharts
            option={messageChartOption}
            style={{ height: 420 }}
            onEvents={{
              click: (params: { name?: string }) => {
                if (params.name) {
                  handleFilterToTable({ platform: params.name })
                }
              },
            }}
          />
        ) : (
          <div className="empty-state">暂无消息分布数据</div>
        )}
      </section>
    ),
    works: (
      <section className="chart-card chart-card-small" style={{ backgroundColor: chartPanel }}>
        {worksChartOption ? (
          <ReactECharts
            option={worksChartOption}
            style={{ height: 420 }}
            onEvents={{
              click: (params: { name?: string }) => {
                if (params.name === '关注' || params.name === '喜欢') {
                  handleFilterToTable({ type: params.name })
                  return
                }
                if (params.name) {
                  handleFilterToTable({ platform: params.name })
                }
              },
            }}
          />
        ) : (
          <div className="empty-state">暂无作品分布数据</div>
        )}
      </section>
    ),
    history: (
      <section className="chart-card chart-card-large" style={{ backgroundColor: chartPanel }}>
        {historyChartOption ? (
          <ReactECharts
            option={historyChartOption}
            style={{ height: 420 }}
            onEvents={{
              click: (params: { name?: string }) => {
                if (params.name) {
                  setDate(String(params.name))
                }
              },
            }}
          />
        ) : (
          <div className="empty-state">暂无趋势数据</div>
        )}
      </section>
    ),
  }

  return (
    <section className="page dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-title-block">
          <h3>
            <span className="dashboard-brand-mark">🚀</span>
            Data<span>Center</span>
          </h3>
        </div>

        <div className="dashboard-header-actions">
          <div className="date-controller">
            <button type="button" className="date-arrow" onClick={() => adjustDate(-1)}>
              ‹
            </button>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <button type="button" className="date-arrow" onClick={() => adjustDate(1)}>
              ›
            </button>
          </div>
          <button
            type="button"
            className="header-button header-button-solid"
            onClick={() => setDate(formatDateInput(new Date()))}
          >
            今天
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">接口加载失败：{error}</div> : null}

      <div className="dashboard-sort-root">
        {topSections.map((sectionId) => {
          if (sectionId === 'nice') {
            return (
              <SortableWrap
                key={sectionId}
                id={sectionId}
                dragType="top"
                className="section-wrapper"
                onDragStart={setDragState}
                onDrop={dropTopSection}
              >
                <section className="dashboard-section">
                  <button
                    type="button"
                    className={`section-header theme-nice ${collapsed.nice ? 'is-collapsed' : ''}`}
                    onClick={() => toggleSection('nice')}
                  >
                    <span className="section-title-group">
                      <span className="drag-handle">⋮⋮</span>
                      <span className="section-title">NiceBot 统计信息</span>
                    </span>
                    <span className="toggle-icon">⌄</span>
                  </button>

                  {!collapsed.nice ? (
                    <div className="section-content">
                      {niceSubSections.map((subSectionId) =>
                        subSectionId === 'cards' ? (
                          <SortableWrap
                            key={subSectionId}
                            id={subSectionId}
                            dragType="nice-sub"
                            className="sub-section-wrapper"
                            onDragStart={setDragState}
                            onDrop={dropNiceSubSection}
                          >
                            <section className="sub-section">
                              <button
                                type="button"
                                className={`sub-title ${collapsed['nice-cards'] ? 'is-collapsed' : ''}`}
                                onClick={() => toggleSection('nice-cards')}
                              >
                                <span className="drag-handle">⋮⋮</span>
                                核心指标
                              </button>
                              {!collapsed['nice-cards'] ? (
                                <div className="dashboard-card-grid">
                                  {niceCards.map((cardId) => (
                                    <SortableWrap
                                      key={cardId}
                                      id={cardId}
                                      dragType="nice-card"
                                      className="dashboard-card-wrap"
                                      onDragStart={setDragState}
                                      onDrop={dropNiceCard}
                                    >
                                      {niceCardMap[cardId]}
                                    </SortableWrap>
                                  ))}
                                </div>
                              ) : null}
                            </section>
                          </SortableWrap>
                        ) : (
                          <SortableWrap
                            key={subSectionId}
                            id={subSectionId}
                            dragType="nice-sub"
                            className="sub-section-wrapper"
                            onDragStart={setDragState}
                            onDrop={dropNiceSubSection}
                          >
                            <section className="sub-section">
                              <button
                                type="button"
                                className={`sub-title ${collapsed['nice-charts'] ? 'is-collapsed' : ''}`}
                                onClick={() => toggleSection('nice-charts')}
                              >
                                <span className="drag-handle">⋮⋮</span>
                                数据图表
                              </button>
                              {!collapsed['nice-charts'] ? (
                                <div className="dashboard-chart-row">
                                  {niceCharts.map((chartId) => (
                                    <SortableWrap
                                      key={chartId}
                                      id={chartId}
                                      dragType="nice-chart"
                                      className={`chart-wrap ${chartId === 'history' ? 'chart-wrap-large' : 'chart-wrap-small'}`}
                                      onDragStart={setDragState}
                                      onDrop={dropNiceChart}
                                    >
                                      {niceChartMap[chartId]}
                                    </SortableWrap>
                                  ))}
                                </div>
                              ) : null}
                            </section>
                          </SortableWrap>
                        ),
                      )}
                    </div>
                  ) : null}
                </section>
              </SortableWrap>
            )
          }

          return (
            <SortableWrap
              key={sectionId}
              id={sectionId}
              dragType="top"
              className="section-wrapper"
              draggable={false}
              onDragStart={setDragState}
              onDrop={dropTopSection}
            >
              <section className="dashboard-section">
                <button
                  type="button"
                  className={`section-header theme-table ${collapsed.table ? 'is-collapsed' : ''}`}
                  onClick={() => toggleSection('table')}
                >
                  <span className="section-title-group">
                    <span className="drag-handle">⋮⋮</span>
                    <span className="section-title">NiceBot 消息明细</span>
                  </span>
                  <span className="toggle-icon">⌄</span>
                </button>

                {!collapsed.table ? (
                  <div className="section-content">
                    <div className="dashboard-toolbar">
                      <div className="dashboard-search">
                        <span className="toolbar-icon">⌕</span>
                        <input
                          type="search"
                          value={filters.search}
                          onChange={(event) => updateFilters({ search: event.target.value })}
                          placeholder="搜索 ID / 用户名 / 描述 / 链接"
                        />
                      </div>
                      <select
                        value={filters.platform}
                        onChange={(event) => updateFilters({ platform: event.target.value })}
                      >
                        <option value="">所有平台</option>
                        {platformOptions.map((platform) => (
                          <option key={platform} value={platform}>
                            {platform}
                          </option>
                        ))}
                      </select>
                      <select value={filters.type} onChange={(event) => updateFilters({ type: event.target.value })}>
                        <option value="">所有类型</option>
                        <option value="关注">关注</option>
                        <option value="喜欢">喜欢</option>
                      </select>
                      <select
                        value={filters.fileType}
                        onChange={(event) => updateFilters({ fileType: event.target.value })}
                      >
                        <option value="">所有附件</option>
                        <option value="图片">图片</option>
                        <option value="视频">视频</option>
                      </select>
                      <button type="button" className="reset-button" onClick={resetFilters}>
                        重置
                      </button>
                    </div>

                    <div className="dashboard-table-shell">
                      <div className="dashboard-table-scroll">
                        <table className="dashboard-table">
                          <thead>
                            <tr>
                              <th className="col-no">序号</th>
                              <th onClick={() => handleSort('id')} className="col-id">
                                ID
                              </th>
                              <th onClick={() => handleSort('time')} className="col-time">
                                时间
                              </th>
                              <th onClick={() => handleSort('platform')} className="col-platform">
                                平台
                              </th>
                              <th onClick={() => handleSort('type')} className="col-type">
                                类型
                              </th>
                              <th onClick={() => handleSort('username')} className="col-user">
                                用户名
                              </th>
                              <th onClick={() => handleSort('fileName')} className="col-file">
                                文件名
                              </th>
                              <th onClick={() => handleSort('description')} className="col-description">
                                描述
                              </th>
                              <th className="col-link">链接</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredMessages.map((message, index) => (
                              <tr key={message.id}>
                                <td className="col-no">{index + 1}</td>
                                <td className="col-id">{message.id}</td>
                                <td className="col-time">{message.time}</td>
                                <td className="col-platform">{message.platform}</td>
                                <td className="col-type">
                                  <span
                                    className={`table-badge ${message.type === '关注' ? 'type-follow' : 'type-like'}`}
                                  >
                                    {message.type}
                                  </span>
                                </td>
                                <td className="col-user">
                                  {message.username ? (
                                    <a
                                      className="user-link"
                                      href={`/user/${encodeURIComponent(message.username)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {message.username}
                                    </a>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="col-file" title={extractFileName(message)}>
                                  {extractFileName(message)}
                                </td>
                                <td className="col-description" title={getDescription(message)}>
                                  {getDescription(message)}
                                </td>
                                <td className="col-link">
                                  {message.url ? (
                                    <a href={message.url} target="_blank" rel="noreferrer" className="table-link">
                                      {message.url}
                                    </a>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {!loading && filteredMessages.length === 0 ? (
                        <div className="table-empty-state">无数据</div>
                      ) : null}
                      <div className="dashboard-table-footer">
                        当前显示 {filteredMessages.length} 条数据（总共 {data.messages.length} 条）
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            </SortableWrap>
          )
        })}
      </div>
    </section>
  )
}
