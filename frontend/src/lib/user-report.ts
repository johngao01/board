export type UserReportResponse = {
  status: 'success' | 'empty' | 'error'
  msg?: string
  stats: {
    total: number
    works: number
    video: number
    image: number
    platforms: Record<string, number>
  }
  info: {
    accounts_stats: Array<{
      userid: string
      username: string
      platform: string
      user_url: string
      msg_count: number
      work_count: number
    }>
    current_month: string
    total_pages: number
  }
  heatmap: Array<[string, number]>
  messages: Array<{
    id: number
    time: string
    user_url: string
    username: string
    platform: string
    text: string
    url: string
    file_type: string
    caption: string
  }>
  total_pages: number
}

export type UserMessagesResponse = {
  status: 'success' | 'error'
  msg?: string
  messages: Array<{
    id: number
    time: string
    user_url: string
    username: string
    platform: string
    text: string
    url: string
    file_type: string
    caption: string
  }>
  total_pages: number
  total_count: number
  current_date: string | null
}

export type UserHeatmapResponse = {
  status: 'success'
  month: string
  data: Array<[string, number]>
}
