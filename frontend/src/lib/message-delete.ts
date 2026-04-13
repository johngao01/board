export type DeleteMode = 'sql' | 'id_range'

export type QueryMode = 'builder' | 'advanced'

export type SqlDeleteOptions = {
  delete_db: boolean
  skip_telegram: boolean
  skip_files: boolean
}

export type SqlPreviewGroup = {
  current_post: number
  total_post: number
  post_key: string
  idstr: string
  username: string
  userid: string
  url: string
  mblogid: string
  message_ids: number[]
  total_messages: number
  media_count: number
  text_count: number
  status: DeliveryCheckStatus
  status_label: string
  detail: string
  ordered_types: string[]
  file_candidates: Array<{
    name: string
    path: string
    status: 'found' | 'missing'
  }>
}

export type SqlPreviewData = {
  mode: DeleteMode
  where?: string
  query_sql?: string
  summary: {
    target_messages: number
    target_posts: number
    delete_window_hours: number
    db_utc_offset_hours: number
  }
  groups: SqlPreviewGroup[]
}

export type ExecutionSummary = {
  target_messages: number
  target_posts: number
  telegram_deleted: number
  telegram_failed: number
  files_deleted: number
  files_failed: number
  db_deleted: number
}

export type ExecutionItemError = {
  message_id?: number
  path?: string
  error: string
}

export type SqlExecutionPost = SqlPreviewGroup & {
  telegram_deleted: number[]
  telegram_failed: ExecutionItemError[]
  files_deleted: string[]
  files_failed: ExecutionItemError[]
  db_deleted: number
}

export type SqlExecutionData = {
  summary: ExecutionSummary
  telegram_failed: ExecutionItemError[]
  file_failed: ExecutionItemError[]
  per_post: SqlExecutionPost[]
}

export type SinglePostExecutionData = {
  post_key: string
  summary: {
    telegram_deleted: number
    telegram_failed: number
    files_deleted: number
    files_failed: number
    db_deleted: number
  }
  telegram_failed: ExecutionItemError[]
  file_failed: ExecutionItemError[]
  files_deleted: string[]
  telegram_deleted: number[]
}

export type RangePreviewData = {
  mode: DeleteMode
  chat_id: number
  start_id: number
  end_id: number
  message_count: number
  message_ids: number[]
}

export type RangeExecutionData = {
  summary: ExecutionSummary
  chat_id: number
  message_ids: number[]
  telegram_failed: ExecutionItemError[]
}

export type DeliveryCheckStatus = 'complete' | 'misordered' | 'missing' | 'duplicate_send' | 'unknown'

export type MessageDeleteApiResponse<T> = {
  status: 'success' | 'error'
  msg?: string
  data: T
}

export type MessageDeleteLogsResponse = MessageDeleteApiResponse<{
  feature: string
  lines: string[]
}>

export type QueryFieldConfig = {
  key: string
  label: string
  type: 'text' | 'number' | 'datetime'
  operators: string[]
}

export type QueryFieldsData = {
  fields: QueryFieldConfig[]
  operator_labels: Record<string, string>
  default_relation: 'AND' | 'OR'
}

export type QueryCondition = {
  id: string
  field: string
  operator: string
  value: string
  value_to?: string
}
