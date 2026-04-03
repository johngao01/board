import {useEffect, useMemo, useState} from 'react'
import ReactECharts from 'echarts-for-react'
import type {EChartsOption} from 'echarts'
import {apiGet, formatDateInput} from '../lib/api'
import {mainPageInfo} from '../config/page-info'
import {useChartTheme} from '../lib/chart-theme'
import {PageIntro} from '../components/PageIntro'
import {loadSessionCached} from '../lib/session-cache'
import type {JuheShanghaiResponse, JuheStatsResponse} from '../lib/juhe'

type JuheSectionKey = 'cards' | 'shanghai' | 'charts'

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
    const pageInfo = mainPageInfo.juhe
    const chartTheme = useChartTheme()
    const [date, setDate] = useState(() => formatDateInput(new Date()))
    const [stats, setStats] = useState<JuheStatsResponse | null>(null)
    const [shanghai, setShanghai] = useState<JuheShanghaiResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [collapsed, setCollapsed] = useState<Record<JuheSectionKey, boolean>>({
        cards: false,
        shanghai: false,
        charts: false,
    })

    useEffect(() => {
        let cancelled = false

        async function loadJuhe() {
            setLoading(true)
            setError(null)

            try {
                const nextData = await loadSessionCached(`juhe:${date}`, async () => {
                    const [statsResponse, shanghaiResponse] = await Promise.all([
                        apiGet<JuheStatsResponse>(`/api/juhe/stats?date=${date}`),
                        apiGet<JuheShanghaiResponse>(`/api/juhe/shanghai?date=${date}`),
                    ])

                    return {
                        stats: statsResponse,
                        shanghai: shanghaiResponse,
                    }
                })

                if (cancelled) {
                    return
                }

                setStats(nextData.stats)
                setShanghai(nextData.shanghai)
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

    const chartText = chartTheme.text
    const chartMuted = chartTheme.muted
    const chartAxis = chartTheme.axis
    const chartGrid = chartTheme.grid
    const chartSplit = chartTheme.split
    const pieBorder = chartTheme.pieBorder
    const baseBar = chartTheme.baseBar
    const baseLabel = chartTheme.baseLabel

    const cityOption = useMemo<EChartsOption | undefined>(() => {
        if (!stats) {
            return undefined
        }

        return {
            backgroundColor: 'transparent',
            tooltip: {trigger: 'axis'},
            legend: {
                bottom: 0,
                itemWidth: 18,
                itemHeight: 10,
                textStyle: {color: chartMuted},
            },
            grid: {left: 28, right: 52, top: 48, bottom: 44, containLabel: true},
            xAxis: {
                type: 'category',
                data: stats.chart_city.map((item) => item.name),
                axisLabel: {color: chartMuted, interval: 0},
                axisLine: {lineStyle: {color: chartGrid}},
            },
            yAxis: [
                {
                    type: 'value',
                    axisLabel: {color: chartAxis},
                    splitLine: {lineStyle: {color: chartSplit}},
                },
                {
                    type: 'value',
                    max: 100,
                    axisLabel: {color: chartAxis, formatter: '{value}%'},
                    splitLine: {show: false},
                },
            ],
            series: [
                {
                    name: '总量',
                    type: 'bar',
                    barGap: '-100%',
                    barWidth: 56,
                    data: stats.chart_city.map((item) => item.total),
                    itemStyle: {color: baseBar},
                    label: {show: true, position: 'top', color: baseLabel, fontWeight: 'bold'},
                },
                {
                    name: '有效',
                    type: 'bar',
                    barWidth: 56,
                    data: stats.chart_city.map((item) => item.valid),
                    itemStyle: {color: '#ff8a65'},
                    label: {show: true, position: 'top', color: '#ff8a65', fontWeight: 'bold'},
                },
                {
                    name: '有效率',
                    type: 'line',
                    yAxisIndex: 1,
                    smooth: true,
                    symbolSize: 8,
                    data: stats.chart_city.map((item) => item.rate),
                    itemStyle: {color: '#7c6cff'},
                    lineStyle: {color: '#7c6cff', width: 3},
                    label: {
                        show: true,
                        formatter: '{c}%',
                        color: '#7c6cff',
                        fontWeight: 'bold',
                    },
                },
            ],
        }
    }, [baseBar, baseLabel, chartAxis, chartGrid, chartMuted, chartSplit, stats])

    const sourceOption = useMemo<EChartsOption | undefined>(() => {
        if (!stats) {
            return undefined
        }

        return {
            backgroundColor: 'transparent',
            tooltip: {trigger: 'item', formatter: '{b}<br/>总量 {c}<br/>占比 {d}%'},
            color: ['#4f8df0', '#70efab', '#ffe06b', '#ff6675'],
            series: [
                {
                    type: 'pie',
                    radius: ['52%', '72%'],
                    center: ['50%', '54%'],
                    itemStyle: {borderRadius: 4, borderColor: pieBorder, borderWidth: 2},
                    label: {
                        show: true,
                        formatter: '{b}\n总量 {c}\n占比 {d}%',
                        color: chartText,
                        fontSize: 12,
                        lineHeight: 20,
                    },
                    labelLine: {
                        lineStyle: {color: chartMuted},
                    },
                    data: stats.chart_source,
                },
            ],
        }
    }, [chartMuted, chartText, pieBorder, stats])

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
                    itemStyle: {borderRadius: 4, borderColor: pieBorder, borderWidth: 2},
                    label: {
                        show: true,
                        formatter: '{b}\n总量 {c}\n占比 {d}%',
                        color: chartText,
                        fontSize: 12,
                        lineHeight: 20,
                    },
                    labelLine: {
                        lineStyle: {color: chartMuted},
                    },
                    data: shanghai.sh_breakdown,
                },
            ],
        }
    }, [chartMuted, chartText, pieBorder, shanghai])

    const shanghaiTrendOption = useMemo<EChartsOption | undefined>(() => {
        if (!shanghai) {
            return undefined
        }

        return {
            backgroundColor: 'transparent',
            tooltip: {trigger: 'axis'},
            legend: {
                top: 0,
                itemWidth: 18,
                itemHeight: 10,
                textStyle: {color: chartMuted},
            },
            grid: {left: 28, right: 24, top: 52, bottom: 28, containLabel: true},
            xAxis: {
                type: 'category',
                data: shanghai.history.dates,
                axisLabel: {color: chartAxis, hideOverlap: true},
                axisLine: {lineStyle: {color: chartGrid}},
            },
            yAxis: {
                type: 'value',
                axisLabel: {color: chartAxis},
                splitLine: {lineStyle: {color: chartSplit}},
            },
            series: [
                {
                    name: '上海新增',
                    type: 'line',
                    smooth: true,
                    symbolSize: 7,
                    data: shanghai.history.sh_vals,
                    itemStyle: {color: '#ffd200'},
                    lineStyle: {color: '#ffd200', width: 3},
                    label: {show: true, color: '#ffd200', fontWeight: 'bold', formatter: '{c}'},
                },
                {
                    name: '所有',
                    type: 'line',
                    smooth: true,
                    symbolSize: 7,
                    data: shanghai.history.all_vals,
                    itemStyle: {color: '#10e8ff'},
                    lineStyle: {color: '#10e8ff', width: 3},
                    label: {show: true, color: '#10e8ff', fontWeight: 'bold', formatter: '{c}'},
                },
            ],
        }
    }, [chartAxis, chartGrid, chartMuted, chartSplit, shanghai])

    const shanghaiPlatformHistoryOption = useMemo<EChartsOption | undefined>(() => {
        if (!shanghai?.platform_history_7d?.dates.length) {
            return undefined
        }

        const palette = ['#10e8ff', '#ffd200', '#12f0a2', '#4f8df0', '#ff6675', '#9b6bff', '#8f99ab']

        return {
            backgroundColor: 'transparent',
            tooltip: {trigger: 'axis', axisPointer: {type: 'shadow'}},
            legend: {
                top: 0,
                itemWidth: 18,
                itemHeight: 10,
                textStyle: {color: chartMuted},
            },
            grid: {left: 28, right: 24, top: 56, bottom: 28, containLabel: true},
            xAxis: {
                type: 'category',
                data: shanghai.platform_history_7d.dates,
                axisLabel: {color: chartAxis, hideOverlap: true},
                axisLine: {lineStyle: {color: chartGrid}},
            },
            yAxis: {
                type: 'value',
                axisLabel: {color: chartAxis},
                splitLine: {lineStyle: {color: chartSplit}},
            },
            series: shanghai.platform_history_7d.series.map((item, index) => ({
                name: item.name,
                type: 'bar',
                barMaxWidth: 28,
                emphasis: {focus: 'series'},
                itemStyle: {
                    color: palette[index % palette.length],
                    borderRadius: [10, 10, 0, 0] as [number, number, number, number],
                },
                label: {
                    show: true,
                    position: 'top',
                    color: chartText,
                    fontWeight: 'bold',
                    formatter: '{c}',
                },
                data: item.values,
            })),
        }
    }, [chartAxis, chartGrid, chartMuted, chartSplit, chartText, shanghai])

    function adjustDate(days: number) {
        const target = new Date(`${date}T00:00:00`)
        target.setDate(target.getDate() + days)
        setDate(formatDateInput(target))
    }

    function toggleSection(section: JuheSectionKey) {
        setCollapsed((current) => ({
            ...current,
            [section]: !current[section],
        }))
    }

    return (
        <section className="page juhe-page">
            <PageIntro
                eyebrow={pageInfo.eyebrow}
                title={
                    <h3>
                        <span className="juhe-title-icon">✴</span>
                        {pageInfo.title}
                    </h3>
                }
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
                                        <strong
                                            className="dashboard-card-value">{loading ? '...' : stats?.kpi.today_new ?? 0}</strong>
                                        <span className={`trend-badge ${trendClass(stats?.kpi.trend_new ?? 0)}`}>
                      {trendText(stats?.kpi.trend_new ?? 0)}
                    </span>
                                    </div>
                                </article>

                                <article className="dashboard-card juhe-kpi-card juhe-kpi-yellow">
                                    <p className="dashboard-card-title">✨ 今日有效新增</p>
                                    <div className="dashboard-card-value-row">
                                        <strong className="dashboard-card-value">
                                            {loading ? '...' : stats?.kpi.today_valid_new ?? 0}
                                        </strong>
                                        <span className={`trend-badge ${trendClass(stats?.kpi.trend_valid_new ?? 0)}`}>
                      {trendText(stats?.kpi.trend_valid_new ?? 0)}
                    </span>
                                    </div>
                                </article>

                                <article className="dashboard-card juhe-kpi-card juhe-kpi-red">
                                    <p className="dashboard-card-title">💀 失效资源 (VALID &lt; 0)</p>
                                    <div className="dashboard-card-value-row">
                                        <strong
                                            className="dashboard-card-value">{loading ? '...' : stats?.kpi.invalid ?? 0}</strong>
                                    </div>
                                </article>
                            </div>
                        </div>
                    ) : null}
                </section>

                <section className="dashboard-section">
                    <button
                        type="button"
                        className={`section-header theme-nice ${collapsed.shanghai ? 'is-collapsed' : ''}`}
                        onClick={() => toggleSection('shanghai')}
                    >
            <span className="section-title-group">
              <span className="drag-handle">⋮⋮</span>
              <span className="section-title">上海市详细数据监控</span>
            </span>
                        <span className="toggle-icon">⌄</span>
                    </button>

                    {!collapsed.shanghai ? (
                        <div className="section-content">
                            <div className="juhe-panel-grid juhe-panel-grid-single">
                                <section className="panel juhe-panel juhe-panel-wide">
                                    <div className="panel-head">
                                        <div>
                                            <h4 className="juhe-panel-title">近7天上海新增平台分布</h4>
                                        </div>
                                    </div>
                                    {shanghaiPlatformHistoryOption ? (
                                        <ReactECharts option={shanghaiPlatformHistoryOption} style={{height: 420}}/>
                                    ) : (
                                        <div className="empty-state">暂无近7天平台分布数据</div>
                                    )}
                                </section>
                            </div>
                            <div className="juhe-panel-grid juhe-panel-grid-centered">
                                <section className="panel juhe-panel juhe-panel-wide">
                                    <div className="panel-head">
                                        <div>
                                            <h4 className="juhe-panel-title">上海平台分布</h4>
                                        </div>
                                    </div>
                                    {shanghaiSourceOption ? (
                                        <ReactECharts option={shanghaiSourceOption} style={{height: 470}}/>
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
                                        <ReactECharts option={shanghaiTrendOption} style={{height: 470}}/>
                                    ) : (
                                        <div className="empty-state">暂无上海趋势数据</div>
                                    )}
                                </section>
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
              <span className="section-title">数据图表</span>
            </span>
                        <span className="toggle-icon">⌄</span>
                    </button>

                    {!collapsed.charts ? (
                        <div className="section-content">
                            <div className="juhe-panel-grid">
                                <section className="panel juhe-panel juhe-panel-wide">
                                    <div className="panel-head">
                                        <div>
                                            <h4 className="juhe-panel-title">热门城市数据质量</h4>
                                        </div>
                                    </div>
                                    {cityOption ? (
                                        <ReactECharts option={cityOption} style={{height: 470}}/>
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
                                        <ReactECharts option={sourceOption} style={{height: 470}}/>
                                    ) : (
                                        <div className="empty-state">暂无来源分布数据</div>
                                    )}
                                </section>
                            </div>
                        </div>
                    ) : null}
                </section>
            </div>
        </section>
    )
}
