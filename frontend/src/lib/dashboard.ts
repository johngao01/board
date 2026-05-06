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
    platform_history_7d: {
      dates: string[]
      platforms: string[]
      messages: Record<string, number[]>
      works: Record<string, number[]>
    }
  }
}

export type WorksDistResponse = {
  total: number
  platforms: Record<string, number>
}

export type TiktokMetricResponse = {
  val: number
  trend: number
  prev: number
}

export type MessageListResponse = {
  data: Array<{
    id: number
    idstr: string
    time: string
    username: string
    text: string
    user_url: string
    platform: string
    type: string
    file_type: string
    caption: string
    url: string
    valid?: number | null
  }>
}

export type TikTokDashboardState = {
  scraped: TiktokMetricResponse | null
  active: TiktokMetricResponse | null
  fresh: TiktokMetricResponse | null
}
