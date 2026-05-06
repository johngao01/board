import type {ReactNode} from 'react'
import {useEffect, useMemo, useState} from 'react'
import ReactECharts from 'echarts-for-react'
import type {ECharts, EChartsOption} from 'echarts'
import {apiGet, formatDateInput} from '../lib/api'
import {mainPageInfo} from '../config/page-info'
import {useChartTheme} from '../lib/chart-theme'
import {PageIntro} from '../components/PageIntro'
import {loadSessionCached} from '../lib/session-cache'
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

type TopSectionId = 'cards' | 'charts' | 'table'
type NiceCardId = 'total' | 'users' | 'works' | 'files'
type NiceChartId = 'messages' | 'works' | 'history'
type SortColumn = 'id' | 'time' | 'platform' | 'type' | 'username' | 'fileName' | 'description'
type SortDirection = 'asc' | 'desc'

type Filters = {
    search: string
    platform: string
    type: string
    fileType: string
    valid: string
}

type CollapsedState = Record<string, boolean>
type DragState<T extends string> = {
    type: 'top' | 'nice-card' | 'nice-chart'
    id: T
}

const emptyState: DashboardState = {
    niceme: null,
    works: null,
    messages: [],
}

const topSectionDefaults: TopSectionId[] = ['cards', 'charts', 'table']
const niceCardDefaults: NiceCardId[] = ['total', 'users', 'works', 'files']
const niceChartDefaults: NiceChartId[] = ['messages', 'works', 'history']
const defaultFilters: Filters = {search: '', platform: '', type: '', fileType: '', valid: ''}

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

function getValidLabel(value: number | null | undefined) {
    if (value === 2) return '特别关注'
    if (value === 1) return '普通关注'
    if (value === 0) return '很久没更新'
    if (value === -1) return '不喜欢了'
    if (value === -2) return '账号失效'
    return '喜欢作品'
}

function getMessageValidFilterValue(value: number | null | undefined) {
    return value == null ? 'null' : String(value)
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

function PlatformHistoryChart({
                                  title,
                                  dates,
                                  platforms,
                                  option,
                                  onPointClick,
                              }: {
    title: string
    dates: string[]
    platforms: string[]
    option?: EChartsOption
    onPointClick: (params: { name?: string; platform?: string }) => void
}) {
    return (
        <section className="platform-history-card">
            <div className="platform-history-header">
                <h4>{title}</h4>
            </div>

            {platforms.length > 0 && dates.length > 0 ? (
                <ReactECharts
                    option={option}
                    style={{height: 430}}
                    onEvents={{
                        click: (params: {
                            name?: string;
                            seriesName?: string;
                            data?: { date?: string; platform?: string }
                        }) => {
                            onPointClick({
                                name: params.data?.date ?? params.name,
                                platform: params.data?.platform ?? params.seriesName,
                            })
                        },
                    }}
                />
            ) : (
                <div className="empty-state">暂无平台趋势数据</div>
            )}
        </section>
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
            onDragStart={draggable ? () => onDragStart({type: dragType, id}) : undefined}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop(id)}
        >
            {children}
        </div>
    )
}

export function DashboardPage() {
    const pageInfo = mainPageInfo.dashboard
    const chartTheme = useChartTheme()
    const [date, setDate] = useState(() => localStorage.getItem('dashboard-date') || formatDateInput(new Date()))
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [data, setData] = useState<DashboardState>(emptyState)
    const [topSections, setTopSections] = useState<TopSectionId[]>(() =>
        readStoredOrder('dashboard-top-sections', topSectionDefaults),
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
            return {
                ...defaultFilters,
                ...(JSON.parse(localStorage.getItem('dashboard-filters') || '{}') as Filters),
                type: '',
            }
        } catch {
            return defaultFilters
        }
    })
    const [sortColumn, setSortColumn] = useState<SortColumn>('id')
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
    const [dragState, setDragState] = useState<DragState<string> | null>(null)
    const [messageChart, setMessageChart] = useState<ECharts | null>(null)
    const [worksChart, setWorksChart] = useState<ECharts | null>(null)

    useEffect(() => {
        localStorage.setItem('dashboard-date', date)
    }, [date])

    useEffect(() => {
        localStorage.setItem('dashboard-top-sections', JSON.stringify(topSections))
    }, [topSections])

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
                const nextData = await loadSessionCached(`dashboard:${date}`, async () => {
                    const [nicemeRes, worksRes, messagesRes] = await Promise.all([
                        apiGet<NicemeResponse>(`/api/niceme?date=${date}`),
                        apiGet<WorksDistResponse>(`/api/niceme/works_dist?date=${date}`),
                        apiGet<MessageListResponse>(`/api/list/niceme_messages?date=${date}`),
                    ])

                    return {
                        niceme: nicemeRes.status === 'success' ? nicemeRes.data : null,
                        works: worksRes,
                        messages: messagesRes.data ?? [],
                    }
                })

                if (cancelled) {
                    return
                }

                setData(nextData)
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
    const platformHistory = niceme?.platform_history_7d

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
                    textStyle: {color: chartText, fontSize: 18, fontWeight: 'bold'},
                },
                {
                    text: String(niceme.total),
                    subtext: '今日消息',
                    left: 'center',
                    top: '46%',
                    textStyle: {color: chartText, fontSize: 30, fontWeight: 'bold'},
                    subtextStyle: {color: chartMuted, fontSize: 14},
                },
            ],
            tooltip: {trigger: 'item'},
            legend: {
                bottom: 0,
                left: 'center',
                textStyle: {color: chartMuted},
            },
            color: ['#4f91ff', '#7af5ab', '#ffe06b', '#ff6978', '#00f2ff'],
            series: [
                {
                    type: 'pie',
                    left: '6%',
                    right: '6%',
                    top: '8%',
                    bottom: '10%',
                    radius: ['52%', '76%'],
                    center: ['50%', '54%'],
                    itemStyle: {borderRadius: 4},
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
                        lineStyle: {color: chartMuted},
                    },
                    labelLayout: {
                        hideOverlap: false,
                        moveOverlap: 'shiftY',
                    },
                    data: Object.entries(niceme.msg_platforms || {}).map(([name, value]) => ({name, value})),
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
                    textStyle: {color: chartText, fontSize: 18, fontWeight: 'bold'},
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
                    subtextStyle: {color: chartMuted, fontSize: 14},
                },
            ],
            tooltip: {trigger: 'item', formatter: '{b}: {c} ({d}%)'},
            legend: {
                bottom: 0,
                left: 'center',
                textStyle: {color: chartMuted},
            },
            series: [
                {
                    name: '平台',
                    type: 'pie',
                    left: '6%',
                    right: '6%',
                    top: '8%',
                    bottom: '10%',
                    radius: ['52%', '76%'],
                    center: ['50%', '54%'],
                    itemStyle: {borderRadius: 4},
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
                        lineStyle: {color: chartMuted},
                    },
                    labelLayout: {hideOverlap: false, moveOverlap: 'shiftY'},
                    data: Object.entries(works.platforms).map(([name, value]) => ({name, value})),
                },
            ]
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
                textStyle: {color: chartText, fontSize: 18, fontWeight: 'bold'},
            },
            tooltip: {trigger: 'axis', axisPointer: {type: 'shadow'}},
            legend: {
                top: 18,
                right: 12,
                textStyle: {color: chartMuted},
            },
            grid: {left: '4%', right: '3%', top: '20%', bottom: '8%', containLabel: true},
            xAxis: {
                type: 'category',
                data: niceme.history.dates,
                axisLabel: {color: chartMuted},
                axisLine: {lineStyle: {color: chartGrid}},
            },
            yAxis: {
                type: 'value',
                axisLabel: {color: chartMuted},
                splitLine: {lineStyle: {color: chartGrid}},
            },
            series: [
                {
                    name: '消息',
                    type: 'bar',
                    data: niceme.history.msgs,
                    itemStyle: {color: '#12dff4'},
                    label: {show: true, position: 'top', color: '#12dff4', fontWeight: 'bold'},
                },
                {
                    name: '作品',
                    type: 'bar',
                    data: niceme.history.works,
                    itemStyle: {color: '#16f2a3'},
                    label: {show: true, position: 'top', color: '#16f2a3', fontWeight: 'bold'},
                },
                {
                    name: '用户',
                    type: 'bar',
                    data: niceme.history.users,
                    itemStyle: {color: '#b700ff'},
                    label: {show: true, position: 'top', color: '#b700ff', fontWeight: 'bold'},
                },
            ],
        }
    }, [chartGrid, chartMuted, chartText, niceme])

    const validDistributionData = useMemo(() => {
        const counts = new Map<string, { name: string; value: number; filterValue: string; color: string }>()
        const worksMap = new Map<string, number | null | undefined>()
        const palette: Record<string, string> = {
            '2': '#ff8a5b',
            '1': '#12dff4',
            '0': '#ffc400',
            '-1': '#b700ff',
            '-2': '#8ea3bf',
            null: '#16f2a3',
        }

        data.messages.forEach((message) => {
            const workKey = message.idstr?.trim() || String(message.id)
            if (!workKey) {
                return
            }
            if (!worksMap.has(workKey)) {
                worksMap.set(workKey, message.valid)
            }
        })

        worksMap.forEach((valid) => {
            const filterValue = getMessageValidFilterValue(valid)
            const current = counts.get(filterValue)
            if (current) {
                current.value += 1
                return
            }
            counts.set(filterValue, {
                name: getValidLabel(valid),
                value: 1,
                filterValue,
                color: palette[filterValue] ?? '#4f91ff',
            })
        })

        return Array.from(counts.values()).filter((item) => item.value > 0)
    }, [data.messages])

    const platformHistoryOption = useMemo<EChartsOption | undefined>(() => {
        if (!platformHistory || platformHistory.dates.length === 0 || platformHistory.platforms.length === 0) {
            return undefined
        }

        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                formatter: (params: Array<{ axisValue?: string; seriesName?: string; data?: number }>) => {
                    if (params.length === 0) {
                        return ''
                    }

                    const date = params[0]?.axisValue ?? ''
                    const lines = params
                        .map((item) => {
                            const platform = item.seriesName ?? ''
                            const messageValue = typeof item.data === 'number' ? item.data : 0
                            const worksValue =
                                platformHistory.works[platform]?.[platformHistory.dates.indexOf(date)] ?? 0
                            return `${platform}<br/>消息: ${messageValue} / 作品: ${worksValue}`
                        })
                        .join('<br/><br/>')

                    return `${date}<br/>${lines}`
                },
            },
            legend: {
                top: 8,
                right: 12,
                textStyle: {color: chartMuted},
            },
            grid: {left: '6%', right: '4%', top: '18%', bottom: '10%', containLabel: true},
            xAxis: {
                type: 'category',
                data: platformHistory.dates,
                axisLabel: {
                    color: chartMuted,
                    formatter: (value: string) => value.slice(5),
                },
                axisLine: {lineStyle: {color: chartGrid}},
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLabel: {
                    color: chartMuted,
                    formatter: (value: number) => {
                        if (value >= 1000) {
                            return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
                        }
                        return String(value)
                    },
                },
                splitLine: {lineStyle: {color: chartGrid}},
            },
            series: platformHistory.platforms.map((platform, index) => {
                const colors = ['#12dff4', '#16f2a3', '#b700ff', '#4f91ff', '#ffc400', '#ff6978', '#8ea3bf']
                const color = colors[index % colors.length]

                return {
                    name: platform,
                    type: 'line',
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 8,
                    data: platformHistory.messages[platform] ?? [],
                    itemStyle: {color},
                    lineStyle: {color, width: 3},
                    emphasis: {focus: 'series'},
                }
            }),
        }
    }, [
        chartGrid,
        chartMuted,
        platformHistory,
    ])

    const validChartOption = useMemo<EChartsOption | undefined>(() => {
        if (validDistributionData.length === 0) {
            return undefined
        }

        return {
            backgroundColor: 'transparent',
            title: {
                text: '当天作品用户状态分布',
                left: 'center',
                top: 8,
                textStyle: {color: chartText, fontSize: 18, fontWeight: 'bold'},
            },
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c}',
            },
            legend: {
                bottom: 0,
                left: 'center',
                textStyle: {color: chartMuted},
            },
            series: [
                {
                    type: 'pie',
                    top: '8%',
                    bottom: '10%',
                    radius: ['52%', '76%'],
                    center: ['50%', '54%'],
                    label: {
                        show: true,
                        formatter: '{b}\n{c}',
                        color: chartText,
                        fontWeight: 'bold',
                    },
                    labelLine: {
                        lineStyle: {color: chartMuted},
                    },
                    data: validDistributionData.map((item) => ({
                        name: item.name,
                        value: item.value,
                        filterValue: item.filterValue,
                        itemStyle: {color: item.color},
                    })),
                },
            ],
        }
    }, [chartMuted, chartText, validDistributionData])

    const hasPlatformHistory = Boolean(
        platformHistory && platformHistory.dates.length > 0 && platformHistory.platforms.length > 0,
    )

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

    const validOptions = useMemo(() => {
        const orderedValues: Array<number | null> = [2, 1, 0, -1, -2, null]
        const presentValues = new Set(data.messages.map((message) => getMessageValidFilterValue(message.valid)))

        return orderedValues
            .filter((value) => presentValues.has(getMessageValidFilterValue(value)))
            .map((value) => ({
                value: getMessageValidFilterValue(value),
                label: getValidLabel(value),
            }))
    }, [data.messages])

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
                (!filters.fileType || message.file_type === filters.fileType) &&
                (!filters.valid || getMessageValidFilterValue(message.valid) === filters.valid)
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

    const validFilterValue = validOptions.some((option) => option.value === filters.valid) ? filters.valid : ''

    function updateFilters(patch: Partial<Filters>) {
        setFilters((current) => ({...current, ...patch}))
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
        setCollapsed((current) => ({...current, table: false}))
        updateFilters(patch)
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

    useEffect(() => bindBlankClickReset(messageChart, () => updateFilters({platform: ''})), [messageChart])
    useEffect(() => bindBlankClickReset(worksChart, () => updateFilters({platform: ''})), [worksChart])

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
                            onClick={() => handleFilterToTable({fileType: '视频'})}
                        >
                            {loading ? '...' : niceme?.files.video ?? 0}
                        </button>
                        <span className="slash-divider">/</span>
                        <button
                            type="button"
                            className="inline-metric-button"
                            onClick={() => handleFilterToTable({fileType: '图片'})}
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
            <section className="chart-card chart-card-small" style={{backgroundColor: chartPanel}}>
                {messageChartOption ? (
                    <ReactECharts
                        option={messageChartOption}
                        style={{height: 470}}
                        onChartReady={setMessageChart}
                        onEvents={{
                            click: (params: { name?: string }) => {
                                if (params.name) {
                                    handleFilterToTable({platform: params.name})
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
            <section className="chart-card chart-card-small" style={{backgroundColor: chartPanel}}>
                {worksChartOption ? (
                    <ReactECharts
                        option={worksChartOption}
                        style={{height: 470}}
                        onChartReady={setWorksChart}
                        onEvents={{
                            click: (params: { name?: string }) => {
                                if (params.name) {
                                    handleFilterToTable({platform: params.name})
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
            <section className="chart-card chart-card-large" style={{backgroundColor: chartPanel}}>
                {validChartOption ? (
                    <ReactECharts
                        option={validChartOption}
                        style={{height: 470}}
                        onEvents={{
                            click: (params: { data?: { filterValue?: string } }) => {
                                const filterValue = params.data?.filterValue
                                if (filterValue) {
                                    handleFilterToTable({valid: filterValue})
                                }
                            },
                        }}
                    />
                ) : (
                    <div className="empty-state">暂无状态分布数据</div>
                )}
            </section>
        ),
    }

    return (
        <section className="page dashboard-page">
            <PageIntro
                eyebrow={pageInfo.eyebrow}
                title={<h3>{pageInfo.title}</h3>}
                description={pageInfo.description}
                actions={
                    <>
                        <div className="date-controller">
                            <button type="button" className="date-arrow" onClick={() => adjustDate(-1)}>
                                ‹
                            </button>
                            <input type="date" value={date} onChange={(event) => setDate(event.target.value)}/>
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
                    </>
                }
            />

            {error ? <div className="error-banner">接口加载失败：{error}</div> : null}

            <div className="dashboard-sort-root">
                {topSections.map((sectionId) => {
                    if (sectionId === 'cards') {
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
                                        </div>
                                    ) : null}
                                </section>
                            </SortableWrap>
                        )
                    }

                    if (sectionId === 'charts') {
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
                                        className={`section-header theme-nice ${collapsed.charts ? 'is-collapsed' : ''}`}
                                        onClick={() => toggleSection('charts')}
                                    >
                    <span className="section-title-group">
                      <span className="drag-handle">⋮⋮</span>
                      <span className="section-title">数据图表</span>
                    </span>
                                        <span className="toggle-icon">⌄</span>
                                    </button>

                                    {!collapsed.charts ? (
                                        <div className="section-content">
                                            <section className="sub-section">
                                                <button
                                                    type="button"
                                                    className="sub-title"
                                                    onClick={() => toggleSection('charts-today')}
                                                >
                                                    <span>今日数据图表</span>
                                                    <span className="toggle-icon">{collapsed['charts-today'] ? '⌄' : '⌃'}</span>
                                                </button>
                                                {!collapsed['charts-today'] ? (
                                                    <div className="dashboard-chart-row">
                                                        {niceCharts.map((chartId) => (
                                                            <SortableWrap
                                                                key={chartId}
                                                                id={chartId}
                                                                dragType="nice-chart"
                                                                className="chart-wrap"
                                                                onDragStart={setDragState}
                                                                onDrop={dropNiceChart}
                                                            >
                                                                {niceChartMap[chartId]}
                                                            </SortableWrap>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </section>

                                            <section className="sub-section">
                                                <button
                                                    type="button"
                                                    className="sub-title"
                                                    onClick={() => toggleSection('charts-history')}
                                                >
                                                    <span>近七日历史图表</span>
                                                    <span className="toggle-icon">{collapsed['charts-history'] ? '⌄' : '⌃'}</span>
                                                </button>
                                                {!collapsed['charts-history'] ? (
                                                    <>
                                                        <div className="platform-history-grid">
                                                            <PlatformHistoryChart
                                                                title="近7天各平台消息数量"
                                                                dates={platformHistory?.dates ?? []}
                                                                platforms={platformHistory?.platforms ?? []}
                                                                option={platformHistoryOption}
                                                                onPointClick={(params) => {
                                                                    if (params.name) {
                                                                        setDate(String(params.name))
                                                                    }
                                                                    if (params.platform) {
                                                                        handleFilterToTable({platform: params.platform})
                                                                    }
                                                                }}
                                                            />
                                                            <section
                                                                className="chart-card chart-card-large"
                                                                style={{backgroundColor: chartPanel, minWidth: 0}}
                                                            >
                                                                {historyChartOption ? (
                                                                    <ReactECharts
                                                                        option={historyChartOption}
                                                                        style={{height: 430}}
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
                                                        </div>
                                                        {!loading && !hasPlatformHistory ? (
                                                            <div className="platform-history-empty-tip">最近 7 天暂无各平台汇总数据</div>
                                                        ) : null}
                                                    </>
                                                ) : null}
                                            </section>
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
                    <span className="section-title">消息明细</span>
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
                                                    onChange={(event) => updateFilters({search: event.target.value})}
                                                    placeholder="搜索 ID / 用户名 / 描述 / 链接"
                                                />
                                            </div>
                                            <select
                                                value={filters.platform}
                                                onChange={(event) => updateFilters({platform: event.target.value})}
                                            >
                                                <option value="">所有平台</option>
                                                {platformOptions.map((platform) => (
                                                    <option key={platform} value={platform}>
                                                        {platform}
                                                    </option>
                                                ))}
                                            </select>
                                            <select
                                                value={validFilterValue}
                                                onChange={(event) => updateFilters({valid: event.target.value})}
                                            >
                                                <option value="">所有状态</option>
                                                {validOptions.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <select
                                                value={filters.fileType}
                                                onChange={(event) => updateFilters({fileType: event.target.value})}
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
                                                        <th onClick={() => handleSort('platform')}
                                                            className="col-platform">
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
                                                        <th onClick={() => handleSort('description')}
                                                            className="col-description">
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
                                                            <td className="col-description"
                                                                title={getDescription(message)}>
                                                                {getDescription(message)}
                                                            </td>
                                                            <td className="col-link">
                                                                {message.url ? (
                                                                    <a href={message.url} target="_blank"
                                                                       rel="noreferrer" className="table-link">
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
