import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { ECharts, EChartsOption } from 'echarts'
import { Link } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { mainPageInfo } from '../config/page-info'
import { useChartTheme } from '../lib/chart-theme'
import { PageIntro } from '../components/PageIntro'
import { loadSessionCached, writeSessionCache } from '../lib/session-cache'
import type { UserListResponse, UserRecord, UserUpdateResponse } from '../lib/users'

type ActiveCell = {
  rowKey: string
  field: string
} | null

type SortDirection = 'asc' | 'desc'
type UserQuickFilter = '' | 'active' | 'special' | 'stale'

type ChartDatum = {
  name: string
  value: number
  filterValue: string
}

type GroupedChartDatum = {
  platformName: string
  platformFilterValue: string
  typeName: string
  typeFilterValue: string
  value: number
}

type UserSectionId = 'cards' | 'charts' | 'table'

type UserPanelStats = {
  total: number
  active: number
  special: number
  stale: number
  platformData: ChartDatum[]
  platformTypeData: GroupedChartDatum[]
  validData: ChartDatum[]
  freshnessData: ChartDatum[]
  latestTrendData: ChartDatum[]
}

function toDisplayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

function readString(row: UserRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value !== null && value !== undefined && value !== '') {
      return String(value)
    }
  }

  return ''
}

function readNumber(row: UserRecord, ...keys: string[]) {
  const value = readString(row, ...keys)
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildRowKey(row: UserRecord) {
  return `${toDisplayValue(row.platform)}::${toDisplayValue(row.USERID)}`
}

function platformLabel(rawPlatform: string) {
  const normalized = rawPlatform.trim().toLowerCase()

  switch (normalized) {
    case 'weibo':
      return '微博'
    case 'douyin':
      return '抖音'
    case 'instagram':
      return 'Instagram'
    case 'bilibili':
    case 'bili':
      return 'B站'
    default:
      return rawPlatform || '未知'
  }
}

function validLabel(valid: number | null) {
  switch (valid) {
    case -2:
      return '失效'
    case -1:
      return '停更'
    case 0:
      return '取消关注'
    case 1:
      return '特别关注'
    case 2:
      return '普通关注'
    default:
      return '未知状态'
  }
}

function freshnessBucket(scrapyTime: Date | null, now: Date) {
  if (!scrapyTime) {
    return '从未抓取'
  }

  const diffHours = (now.getTime() - scrapyTime.getTime()) / 36e5
  if (diffHours <= 24) {
    return '24小时内'
  }
  if (diffHours <= 72) {
    return '3天内'
  }
  if (diffHours <= 168) {
    return '7天内'
  }
  return '7天以上'
}

function monthBucket(date: Date | null) {
  if (!date) {
    return '未知'
  }

  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`
}

function buildUserHomepage(platform: string, userId: string) {
  const normalizedPlatform = platform.trim().toLowerCase()
  const normalizedUserId = userId.trim()

  if (!normalizedPlatform || !normalizedUserId) {
    return ''
  }

  if (normalizedPlatform === 'weibo') {
    return `https://weibo.com/u/${normalizedUserId}`
  }
  if (normalizedPlatform === 'douyin') {
    return `https://douyin.com/user/${normalizedUserId}`
  }
  if (normalizedPlatform === 'instagram') {
    return `https://instagram.com/${normalizedUserId}`
  }
  if (normalizedPlatform === 'bilibili' || normalizedPlatform === 'bili') {
    return `https://space.bilibili.com/${normalizedUserId}`
  }

  return ''
}

function getDerivedValues(row: UserRecord, draft?: Record<string, string>) {
  const currentPlatform = draft?.platform ?? toDisplayValue(row.platform)
  const currentValid = draft?.valid ?? toDisplayValue(row.valid)
  const currentLatestTime = draft?.latest_time ?? toDisplayValue(row.latest_time)
  const currentScrapyTime = draft?.scrapy_time ?? toDisplayValue(row.scrapy_time)

  return {
    currentPlatform,
    platformName: platformLabel(currentPlatform),
    currentValid,
    validName: validLabel(currentValid === '' ? null : Number(currentValid)),
    freshness: freshnessBucket(
      currentScrapyTime ? new Date(currentScrapyTime.replace(' ', 'T')) : null,
      new Date(),
    ),
    latestMonth: monthBucket(currentLatestTime ? new Date(currentLatestTime.replace(' ', 'T')) : null),
  }
}

function compareMixed(left: string, right: string, direction: SortDirection) {
  const leftNum = Number(left)
  const rightNum = Number(right)
  const leftDate = Date.parse(left.replace(' ', 'T'))
  const rightDate = Date.parse(right.replace(' ', 'T'))

  let result = 0
  if (left !== '' && right !== '' && Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
    result = leftNum - rightNum
  } else if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
    result = leftDate - rightDate
  } else {
    result = left.localeCompare(right, 'zh-CN')
  }

  return direction === 'asc' ? result : -result
}

function buildUserPanelStats(rows: Array<{ row: UserRecord; derived: ReturnType<typeof getDerivedValues> }>): UserPanelStats {
  const platformMap = new Map<string, ChartDatum>()
  const platformTypeMap = new Map<string, GroupedChartDatum>()
  const validMap = new Map<string, ChartDatum>()
  const freshnessMap = new Map<string, ChartDatum>([
    ['24小时内', { name: '24小时内', value: 0, filterValue: '24小时内' }],
    ['3天内', { name: '3天内', value: 0, filterValue: '3天内' }],
    ['7天内', { name: '7天内', value: 0, filterValue: '7天内' }],
    ['7天以上', { name: '7天以上', value: 0, filterValue: '7天以上' }],
    ['从未抓取', { name: '从未抓取', value: 0, filterValue: '从未抓取' }],
  ])
  const monthMap = new Map<string, ChartDatum>()

  let active = 0
  let special = 0
  let stale = 0

  for (const item of rows) {
    const { derived } = item
    const valid = readNumber({ valid: derived.currentValid }, 'valid')

    platformMap.set(derived.currentPlatform, {
      name: derived.platformName,
      value: (platformMap.get(derived.currentPlatform)?.value ?? 0) + 1,
      filterValue: derived.currentPlatform,
    })
    const platformTypeKey = `${derived.currentPlatform}::${derived.currentValid}`
    platformTypeMap.set(platformTypeKey, {
      platformName: derived.platformName,
      platformFilterValue: derived.currentPlatform,
      typeName: derived.validName,
      typeFilterValue: derived.currentValid,
      value: (platformTypeMap.get(platformTypeKey)?.value ?? 0) + 1,
    })
    validMap.set(derived.currentValid, {
      name: derived.validName,
      value: (validMap.get(derived.currentValid)?.value ?? 0) + 1,
      filterValue: derived.currentValid,
    })
    freshnessMap.set(derived.freshness, {
      name: derived.freshness,
      value: (freshnessMap.get(derived.freshness)?.value ?? 0) + 1,
      filterValue: derived.freshness,
    })
    monthMap.set(derived.latestMonth, {
      name: derived.latestMonth,
      value: (monthMap.get(derived.latestMonth)?.value ?? 0) + 1,
      filterValue: derived.latestMonth,
    })

    if ((valid ?? 0) > 0) {
      active += 1
    }
    if (valid === 1) {
      special += 1
    }
    if (derived.freshness === '7天以上' || derived.freshness === '从未抓取') {
      stale += 1
    }
  }

  return {
    total: rows.length,
    active,
    special,
    stale,
    platformData: Array.from(platformMap.values()),
    platformTypeData: Array.from(platformTypeMap.values()),
    validData: Array.from(validMap.values()),
    freshnessData: Array.from(freshnessMap.values()),
    latestTrendData: Array.from(monthMap.values())
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(-6),
  }
}

function buildDraftMap(rows: UserRecord[]) {
  return Object.fromEntries(
    rows.map((row) => [
      buildRowKey(row),
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value == null ? '' : String(value)])),
    ]),
  )
}

export function UserManagePage() {
  const pageInfo = mainPageInfo.users
  const chartTheme = useChartTheme()
  const [rows, setRows] = useState<UserRecord[]>([])
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})
  const [query, setQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [validFilter, setValidFilter] = useState('')
  const [freshnessFilter, setFreshnessFilter] = useState('')
  const [latestMonthFilter, setLatestMonthFilter] = useState('')
  const [quickFilter, setQuickFilter] = useState<UserQuickFilter>('')
  const [sortColumn, setSortColumn] = useState('USERID')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [activeCell, setActiveCell] = useState<ActiveCell>(null)
  const [collapsed, setCollapsed] = useState<Record<UserSectionId, boolean>>(() => {
    try {
      return {
        cards: false,
        charts: false,
        table: false,
        ...(JSON.parse(localStorage.getItem('user-manage-collapsed') || '{}') as Partial<Record<UserSectionId, boolean>>),
      }
    } catch {
      return { cards: false, charts: false, table: false }
    }
  })
  const [platformChart, setPlatformChart] = useState<ECharts | null>(null)
  const [validChart, setValidChart] = useState<ECharts | null>(null)
  const [freshnessChart, setFreshnessChart] = useState<ECharts | null>(null)
  const [latestChart, setLatestChart] = useState<ECharts | null>(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    localStorage.setItem('user-manage-collapsed', JSON.stringify(collapsed))
  }, [collapsed])

  useEffect(() => {
    let cancelled = false

    async function loadUsers() {
      setLoading(true)
      setFeedback(null)

      try {
        const data = await loadSessionCached('user-manage:rows', async () => {
          const response = await apiGet<UserListResponse>('/api/niceme/users')
          return response.data ?? []
        })

        if (cancelled) {
          return
        }

        setRows(data)
        setDrafts(buildDraftMap(data))
      } catch (error) {
        if (!cancelled) {
          setFeedback(error instanceof Error ? error.message : '用户列表加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadUsers()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loading && !feedback) {
      writeSessionCache('user-manage:rows', rows)
    }
  }, [feedback, loading, rows])

  const columns = useMemo(() => {
    const ordered = new Set<string>()
    for (const priorityKey of ['USERID', 'USERNAME', 'platform', 'latest_time', 'scrapy_time', 'valid']) {
      ordered.add(priorityKey)
    }

    for (const row of rows) {
      for (const key of Object.keys(row)) {
        ordered.add(key)
      }
    }

    return Array.from(ordered)
  }, [rows])

  const derivedRows = useMemo(
    () =>
      rows.map((row) => {
        const rowKey = buildRowKey(row)
        return {
          row,
          rowKey,
          draft: drafts[rowKey] ?? {},
          derived: getDerivedValues(row, drafts[rowKey]),
        }
      }),
    [drafts, rows],
  )

  const platformOptions = useMemo(
    () => Array.from(new Set(derivedRows.map((item) => item.derived.currentPlatform).filter(Boolean))).sort(),
    [derivedRows],
  )

  const validOptions = useMemo(
    () => Array.from(new Set(derivedRows.map((item) => item.derived.currentValid).filter(Boolean))).sort(),
    [derivedRows],
  )

  const freshnessOptions = useMemo(
    () => ['24小时内', '3天内', '7天内', '7天以上', '从未抓取'].filter((option) => derivedRows.some((item) => item.derived.freshness === option)),
    [derivedRows],
  )

  const filteredRows = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()

    return derivedRows
      .filter((item) => {
        const matchesSearch =
          !keyword ||
          Object.values(item.row).some((value) => String(value ?? '').toLowerCase().includes(keyword)) ||
          Object.values(item.draft).some((value) => String(value ?? '').toLowerCase().includes(keyword))
        const matchesPlatform = !platformFilter || item.derived.currentPlatform === platformFilter
        const matchesValid = !validFilter || item.derived.currentValid === validFilter
        const matchesFreshness = !freshnessFilter || item.derived.freshness === freshnessFilter
        const matchesLatestMonth = !latestMonthFilter || item.derived.latestMonth === latestMonthFilter
        const numericValid = Number(item.derived.currentValid)
        const matchesQuickFilter =
          quickFilter === 'active'
            ? numericValid > 0
            : quickFilter === 'special'
              ? numericValid === 1
              : quickFilter === 'stale'
                ? item.derived.freshness === '7天以上' || item.derived.freshness === '从未抓取'
                : true

        return (
          matchesSearch &&
          matchesPlatform &&
          matchesValid &&
          matchesFreshness &&
          matchesLatestMonth &&
          matchesQuickFilter
        )
      })
      .sort((left, right) => {
        const leftValue =
          sortColumn === '__freshness'
            ? left.derived.freshness
            : sortColumn === '__latest_month'
              ? left.derived.latestMonth
              : left.draft[sortColumn] ?? toDisplayValue(left.row[sortColumn])
        const rightValue =
          sortColumn === '__freshness'
            ? right.derived.freshness
            : sortColumn === '__latest_month'
              ? right.derived.latestMonth
              : right.draft[sortColumn] ?? toDisplayValue(right.row[sortColumn])

        return compareMixed(String(leftValue ?? ''), String(rightValue ?? ''), sortDirection)
      })
  }, [
    deferredQuery,
    derivedRows,
    freshnessFilter,
    latestMonthFilter,
    platformFilter,
    quickFilter,
    sortColumn,
    sortDirection,
    validFilter,
  ])

  const panelStats = useMemo(() => buildUserPanelStats(filteredRows), [filteredRows])
  const basePanelStats = useMemo(() => buildUserPanelStats(derivedRows), [derivedRows])
  const hasUserFilters = Boolean(
    deferredQuery.trim() || platformFilter || validFilter || freshnessFilter || latestMonthFilter || quickFilter,
  )

  function clearAllFilters() {
    setQuery('')
    setPlatformFilter('')
    setValidFilter('')
    setFreshnessFilter('')
    setLatestMonthFilter('')
    setQuickFilter('')
  }

  function toggleQuickFilter(nextFilter: Exclude<UserQuickFilter, ''>) {
    setQuickFilter((current) => (current === nextFilter ? '' : nextFilter))
  }

  function updateDraft(rowKey: string, field: string, value: string) {
    setDrafts((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] ?? {}),
        [field]: value,
      },
    }))
  }

  function resetCellDraft(rowKey: string, field: string, row: UserRecord) {
    updateDraft(rowKey, field, toDisplayValue(row[field]))
  }

  function toggleSection(section: UserSectionId) {
    setCollapsed((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

  function bindBlankClickReset(chart: ECharts | null, onBlankClick: () => void) {
    if (!chart) {
      return undefined
    }

    const zr = chart.getZr()
    const handler = (params: { target?: unknown }) => {
      if (!params.target) {
        onBlankClick()
      }
    }

    zr.on('click', handler)
    return () => {
      zr.off('click', handler)
    }
  }

  async function saveRow(row: UserRecord) {
    const rowKey = buildRowKey(row)
    const draft = drafts[rowKey] ?? {}
    const changedEntries = columns.filter((field) => toDisplayValue(row[field]) !== (draft[field] ?? ''))

    if (changedEntries.length === 0) {
      return
    }

    setFeedback(null)

    try {
      const payload = Object.fromEntries(changedEntries.map((field) => [field, draft[field] ?? '']))
      const originalUserId = toDisplayValue(row.USERID)
      const originalPlatform = toDisplayValue(row.platform)

      const response = await fetch(
        `/api/niceme/users/${encodeURIComponent(originalUserId)}?platform=${encodeURIComponent(originalPlatform)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        },
      )

      const result = (await response.json()) as UserUpdateResponse
      if (!response.ok || result.status !== 'success') {
        throw new Error(result.msg || `USERID=${originalUserId} 保存失败`)
      }

      const nextRow = { ...row, ...payload }
      const nextKey = buildRowKey(nextRow)

      setRows((current) => current.map((item) => (buildRowKey(item) === rowKey ? nextRow : item)))
      setDrafts((current) => {
        const nextDrafts = { ...current }
        delete nextDrafts[rowKey]
        nextDrafts[nextKey] = Object.fromEntries(
          Object.entries(nextRow).map(([key, value]) => [key, value == null ? '' : String(value)]),
        )
        return nextDrafts
      })
      setFeedback(`USERID=${toDisplayValue(nextRow.USERID)} 保存成功`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '保存失败')
    }
  }

  function handleSort(column: string) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortColumn(column)
    setSortDirection('asc')
  }

  useEffect(
    () =>
      bindBlankClickReset(platformChart, () => {
        setPlatformFilter('')
        setValidFilter('')
      }),
    [platformChart],
  )
  useEffect(() => bindBlankClickReset(validChart, () => setValidFilter('')), [validChart])
  useEffect(() => bindBlankClickReset(freshnessChart, () => setFreshnessFilter('')), [freshnessChart])
  useEffect(() => bindBlankClickReset(latestChart, () => setLatestMonthFilter('')), [latestChart])

  const platformChartOption = useMemo<EChartsOption>(
    () => {
      const platformEntries = panelStats.platformData
      const platformNames = platformEntries.map((item) => item.name)
      const typeEntries = panelStats.validData
      const typePalette = ['#00d5ff', '#15e8a6', '#ffd35a', '#8f6bff', '#ff7b7b', '#6fd6ff']
      const valueMap = new Map(
        panelStats.platformTypeData.map((item) => [`${item.platformFilterValue}::${item.typeFilterValue}`, item.value]),
      )

      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
        },
        legend: {
          top: 0,
          right: 0,
          textStyle: { color: chartTheme.muted },
        },
        grid: { left: 20, right: 20, top: 52, bottom: 12, containLabel: true },
        xAxis: {
          type: 'category',
          data: platformNames,
          axisLabel: { color: chartTheme.axis },
          axisLine: { lineStyle: { color: chartTheme.grid } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: chartTheme.axis },
          splitLine: { lineStyle: { color: chartTheme.split } },
        },
        series: typeEntries.map((typeItem, index) => ({
          name: typeItem.name,
          type: 'bar',
          barMaxWidth: 28,
          itemStyle: {
            borderRadius: [10, 10, 0, 0],
            color: typePalette[index % typePalette.length],
          },
          label: {
            show: true,
            position: 'top',
            color: chartTheme.text,
            fontWeight: 'bold',
          },
          data: platformEntries.map((platformItem) => ({
            value: valueMap.get(`${platformItem.filterValue}::${typeItem.filterValue}`) ?? 0,
            platformFilterValue: platformItem.filterValue,
            validFilterValue: typeItem.filterValue,
          })),
        })),
      }
    },
    [chartTheme, panelStats.platformData, panelStats.platformTypeData, panelStats.validData],
  )

  const validChartOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 0,
        textStyle: { color: chartTheme.muted },
      },
      color: ['#16f2a3', '#00d5ff', '#ffd35a', '#ff7b7b', '#8f6bff'],
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '44%'],
          itemStyle: { borderRadius: 6, borderColor: chartTheme.pieBorder, borderWidth: 2 },
          label: {
            show: true,
            formatter: '{b}\n{c}',
            color: chartTheme.text,
          },
          labelLine: { lineStyle: { color: chartTheme.muted } },
          data: panelStats.validData.map((item) => ({
            name: item.name,
            value: item.value,
            filterValue: item.filterValue,
          })),
        },
      ],
    }),
    [chartTheme, panelStats.validData],
  )

  const freshnessChartOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 80, right: 20, top: 20, bottom: 20, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: chartTheme.axis },
        splitLine: { lineStyle: { color: chartTheme.split } },
      },
      yAxis: {
        type: 'category',
        data: panelStats.freshnessData.map((item) => item.name),
        axisLabel: { color: chartTheme.axis },
        axisLine: { lineStyle: { color: chartTheme.grid } },
      },
      series: [
        {
          type: 'bar',
          data: panelStats.freshnessData.map((item) => ({ value: item.value, filterValue: item.filterValue })),
          barWidth: 16,
          itemStyle: {
            borderRadius: 999,
            color: '#8f6bff',
          },
          label: {
            show: true,
            position: 'right',
            color: chartTheme.text,
            fontWeight: 'bold',
          },
        },
      ],
    }),
    [chartTheme, panelStats.freshnessData],
  )

  const latestTrendOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 20, right: 20, top: 28, bottom: 18, containLabel: true },
      xAxis: {
        type: 'category',
        data: panelStats.latestTrendData.map((item) => item.name),
        axisLabel: { color: chartTheme.axis },
        axisLine: { lineStyle: { color: chartTheme.grid } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: chartTheme.axis },
        splitLine: { lineStyle: { color: chartTheme.split } },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbolSize: 8,
          data: panelStats.latestTrendData.map((item) => ({ value: item.value, filterValue: item.filterValue })),
          itemStyle: { color: '#ffd35a' },
          lineStyle: { color: '#ffd35a', width: 3 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255, 211, 90, 0.35)' },
                { offset: 1, color: 'rgba(255, 211, 90, 0.04)' },
              ],
            },
          },
          label: {
            show: true,
            color: '#ffd35a',
            fontWeight: 'bold',
          },
        },
      ],
    }),
    [chartTheme, panelStats.latestTrendData],
  )

  return (
    <section className="page">
      <PageIntro
        eyebrow={pageInfo.eyebrow}
        title={<h3>{pageInfo.title}</h3>}
        description={pageInfo.description}
      />

      {feedback ? <div className="info-banner">{feedback}</div> : null}

      <section className="dashboard-section">
        <button
          type="button"
          className={`section-header theme-nice ${collapsed.cards ? 'is-collapsed' : ''}`}
          onClick={() => toggleSection('cards')}
        >
          <span className="section-title-group">
            <span className="drag-handle">⋮⋮</span>
            <span className="section-title">核心指标</span>
          </span>
          <span className="toggle-icon">⌄</span>
        </button>

        {!collapsed.cards ? (
          <div className="section-content">
            <div className="stats-grid user-manage-kpi-grid">
              <button
                type="button"
                className={`dashboard-card user-manage-kpi-card accent-cyan${hasUserFilters ? ' is-active' : ''}`}
                onClick={clearAllFilters}
              >
                <p className="dashboard-card-title">{hasUserFilters ? '筛选后用户数' : '全部关注'}</p>
                <strong className="dashboard-card-value">
                  {loading ? '...' : hasUserFilters ? panelStats.total : basePanelStats.total}
                </strong>
              </button>
              <button
                type="button"
                className={`dashboard-card user-manage-kpi-card accent-green${quickFilter === 'active' ? ' is-active' : ''}`}
                onClick={() => toggleQuickFilter('active')}
              >
                <p className="dashboard-card-title">有效关注</p>
                <strong className="dashboard-card-value">{loading ? '...' : panelStats.active}</strong>
              </button>
              <button
                type="button"
                className={`dashboard-card user-manage-kpi-card accent-gold${quickFilter === 'special' ? ' is-active' : ''}`}
                onClick={() => toggleQuickFilter('special')}
              >
                <p className="dashboard-card-title">特别关注</p>
                <strong className="dashboard-card-value">{loading ? '...' : panelStats.special}</strong>
              </button>
              <button
                type="button"
                className={`dashboard-card user-manage-kpi-card${quickFilter === 'stale' ? ' is-active' : ''}`}
                onClick={() => toggleQuickFilter('stale')}
              >
                <p className="dashboard-card-title">待巡检</p>
                <strong className="dashboard-card-value">{loading ? '...' : panelStats.stale}</strong>
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="dashboard-section">
        <button
          type="button"
          className={`section-header theme-nice ${collapsed.charts ? 'is-collapsed' : ''}`}
          onClick={() => toggleSection('charts')}
        >
          <span className="section-title-group">
            <span className="drag-handle">⋮⋮</span>
            <span className="section-title">图表报告</span>
          </span>
          <span className="toggle-icon">⌄</span>
        </button>

        {!collapsed.charts ? (
          <div className="section-content">
            <div className="user-manage-chart-grid">
              <section className="panel user-manage-chart-card user-manage-chart-card-wide">
                <div className="panel-head">
                  <h4>各平台关注类型分布图</h4>
                </div>
                <ReactECharts
                  option={platformChartOption}
                  style={{ height: 320 }}
                  onChartReady={setPlatformChart}
                  onEvents={{
                    click: (params: { data?: { platformFilterValue?: string; validFilterValue?: string } }) => {
                      setPlatformFilter(params.data?.platformFilterValue ?? '')
                      setValidFilter(params.data?.validFilterValue ?? '')
                    },
                  }}
                />
              </section>

              <section className="panel user-manage-chart-card">
                <div className="panel-head">
                  <h4>关注状态分布</h4>
                </div>
                <ReactECharts
                  option={validChartOption}
                  style={{ height: 320 }}
                  onChartReady={setValidChart}
                  onEvents={{ click: (params: { data?: { filterValue?: string } }) => setValidFilter(params.data?.filterValue ?? '') }}
                />
              </section>

              <section className="panel user-manage-chart-card">
                <div className="panel-head">
                  <h4>抓取新鲜度</h4>
                </div>
                <ReactECharts
                  option={freshnessChartOption}
                  style={{ height: 300 }}
                  onChartReady={setFreshnessChart}
                  onEvents={{ click: (params: { data?: { filterValue?: string } }) => setFreshnessFilter(params.data?.filterValue ?? '') }}
                />
              </section>

              <section className="panel user-manage-chart-card">
                <div className="panel-head">
                  <h4>最近作品月份趋势</h4>
                </div>
                <ReactECharts
                  option={latestTrendOption}
                  style={{ height: 300 }}
                  onChartReady={setLatestChart}
                  onEvents={{ click: (params: { data?: { filterValue?: string } }) => setLatestMonthFilter(params.data?.filterValue ?? '') }}
                />
              </section>
            </div>
          </div>
        ) : null}
      </section>

      <section className="dashboard-section">
        <button
          type="button"
          className={`section-header theme-table ${collapsed.table ? 'is-collapsed' : ''}`}
          onClick={() => toggleSection('table')}
        >
          <span className="section-title-group">
            <span className="drag-handle">⋮⋮</span>
            <span className="section-title">关注用户详细</span>
          </span>
          <span className="toggle-icon">⌄</span>
        </button>

        {!collapsed.table ? (
          <div className="section-content">
            <div className="dashboard-toolbar user-manage-toolbar">
              <label className="dashboard-search user-manage-search">
                <span className="toolbar-icon">⌕</span>
                <input
                  placeholder="搜索任意字段"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select className="user-manage-filter" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                <option value="">所有平台</option>
                {platformOptions.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
              <select className="user-manage-filter" value={validFilter} onChange={(event) => setValidFilter(event.target.value)}>
                <option value="">所有 valid</option>
                {validOptions.map((valid) => (
                  <option key={valid} value={valid}>
                    {valid}
                  </option>
                ))}
              </select>
              <select className="user-manage-filter" value={freshnessFilter} onChange={(event) => setFreshnessFilter(event.target.value)}>
                <option value="">所有新鲜度</option>
                {freshnessOptions.map((freshness) => (
                  <option key={freshness} value={freshness}>
                    {freshness}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="reset-button"
                onClick={() => {
                  clearAllFilters()
                  setActiveCell(null)
                }}
              >
                重置
              </button>
            </div>

            <div className="dashboard-table-shell">
              <div className="dashboard-table-scroll">
                <table className="dashboard-table user-manage-raw-table">
                  <thead>
                    <tr>
                      {columns.map((column) => {
                        const isActiveSort = sortColumn === column
                        return (
                          <th key={column} onClick={() => handleSort(column)}>
                            {column}
                            {isActiveSort ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((item) => {
                      const { row, rowKey, draft, derived } = item
                      const currentUserId = draft.USERID ?? toDisplayValue(row.USERID)
                      const currentUsername = draft.USERNAME ?? toDisplayValue(row.USERNAME)
                      const homepage = buildUserHomepage(derived.currentPlatform, currentUserId)

                      return (
                        <tr key={rowKey}>
                          {columns.map((column) => {
                            const cellValue = draft[column] ?? ''
                            const isEditing = activeCell?.rowKey === rowKey && activeCell?.field === column

                            return (
                              <td
                                key={column}
                                className={`user-manage-table-cell${isEditing ? ' is-editing' : ''}`}
                                onDoubleClick={() => setActiveCell({ rowKey, field: column })}
                              >
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    className="user-manage-cell-editor"
                                    value={cellValue}
                                    onChange={(event) => updateDraft(rowKey, column, event.target.value)}
                                    onBlur={() => {
                                      resetCellDraft(rowKey, column, row)
                                      setActiveCell(null)
                                    }}
                                    onKeyDown={async (event) => {
                                      if (event.key === 'Enter') {
                                        event.preventDefault()
                                        await saveRow(row)
                                        setActiveCell(null)
                                      }
                                      if (event.key === 'Escape') {
                                        event.preventDefault()
                                        resetCellDraft(rowKey, column, row)
                                        setActiveCell(null)
                                      }
                                    }}
                                  />
                                ) : column === 'USERID' && homepage ? (
                                  <a
                                    className="user-manage-inline-link"
                                    href={homepage}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={cellValue}
                                  >
                                    {cellValue || '-'}
                                  </a>
                                ) : column === 'USERNAME' && currentUsername ? (
                                  <Link
                                    className="user-manage-inline-link"
                                    to={`/user/${encodeURIComponent(currentUsername)}`}
                                    title={cellValue}
                                  >
                                    {cellValue || '-'}
                                  </Link>
                                ) : (
                                  <span className="user-manage-cell-text" title={cellValue}>
                                    {cellValue || '-'}
                                  </span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    {!loading && filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length}>
                          <div className="table-empty-state">没有匹配到用户</div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  )
}
