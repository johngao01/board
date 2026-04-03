export type JuheStatsResponse = {
  status: 'success' | 'error'
  msg?: string
  kpi: {
    total_str: string
    rate: number
    invalid: number
    today_new: number
    trend_new: number
    prev_new: number
    today_valid_new: number
    trend_valid_new: number
    prev_valid_new: number
  }
  chart_source: Array<{
    name: string
    value: number
    valid_count: number
    valid_rate: number
  }>
  chart_city: Array<{
    name: string
    total: number
    valid: number
    rate: number
  }>
}

export type JuheShanghaiResponse = {
  total: number
  valid: number
  sh_breakdown: Array<{
    name: string
    value: number
    valid_count: number
    valid_rate: number
    latest_date: string
  }>
  history: {
    dates: string[]
    sh_vals: number[]
    all_vals: number[]
  }
  platform_history_7d: {
    dates: string[]
    series: Array<{
      name: string
      values: number[]
    }>
  }
}
