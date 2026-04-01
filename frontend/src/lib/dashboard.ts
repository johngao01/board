export type NicemeResponse = {
  status: 'success' | 'empty' | 'error'
  msg?: string
  data: {
    total: number
    total_trend: number
    total_prev: number
    users: number
    users_trend: number
    users_prev: number
    works: number
    works_trend: number
    works_prev: number
    files: {
      video: number
      image: number
    }
    files_trend: number
    files_prev_str: string
    msg_platforms: Record<string, number>
    history: {
      dates: string[]
      msgs: number[]
      users: number[]
      works: number[]
    }
  }
}

export type WorksDistResponse = {
  total: number
  platforms: Record<string, number>
  types: Record<string, number>
  prev_str: string
}

export type TiktokMetricResponse = {
  val: number
  trend: number
  prev: number
}

export type MessageListResponse = {
  data: Array<{
    id: number
    time: string
    username: string
    text: string
    user_url: string
    platform: string
    type: string
    file_type: string
    caption: string
    url: string
  }>
}

export type TikTokDashboardState = {
  scraped: TiktokMetricResponse | null
  active: TiktokMetricResponse | null
  fresh: TiktokMetricResponse | null
}
