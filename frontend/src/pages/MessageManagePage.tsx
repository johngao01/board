import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { PageIntro } from '../components/PageIntro'
import { mainPageInfo } from '../config/page-info'
import type {
  DeliveryCheckData,
  MessageDeleteApiResponse,
  MessageDeleteLogsResponse,
  QueryCondition,
  QueryFieldConfig,
  QueryFieldsData,
  RangeExecutionData,
  RangePreviewData,
  SinglePostExecutionData,
  SqlPreviewGroup,
  SqlPreviewData,
} from '../lib/message-delete'

type DeleteTab = 'builder' | 'advanced_sql' | 'id_range' | 'delivery_check'
type SqlQueryTab = 'builder' | 'advanced_sql'
type RelationMode = 'AND' | 'OR'
type RangeSortOrder = 'asc' | 'desc'
type DeliveryFilter = 'all' | 'non_complete' | 'complete' | 'misordered' | 'missing' | 'duplicate_send' | 'unknown'

type ExecuteModalState = {
  postKey: string
  queryTab: SqlQueryTab
  deleteTelegram: boolean
  deleteFiles: boolean
  deleteDb: boolean
} | null

type PreviewNoticeState = {
  message: string
  token: number
} | null

type ExpandedPostState = Record<string, boolean>

type SqlPreviewPayload = {
  query_mode: 'builder' | 'advanced'
  relation?: RelationMode
  conditions?: Array<{
    field: string
    operator: string
    value: string
    value_to?: string
  }>
  where_clause?: string
}

const DEFAULT_QUERY_FIELDS: QueryFieldConfig[] = [
  { key: 'MESSAGE_ID', label: 'MESSAGE_ID', type: 'number', operators: ['eq', 'ne', 'gte', 'lte', 'between', 'in'] },
  { key: 'CAPTION', label: 'CAPTION', type: 'text', operators: ['eq', 'ne', 'contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'] },
  { key: 'CHAT_ID', label: 'CHAT_ID', type: 'text', operators: ['eq', 'ne', 'in'] },
  { key: 'DATE_TIME', label: 'DATE_TIME', type: 'datetime', operators: ['gte', 'lte', 'between'] },
  { key: 'MEDIA_GROUP_ID', label: 'MEDIA_GROUP_ID', type: 'text', operators: ['eq', 'ne', 'contains', 'is_empty', 'is_not_empty'] },
  { key: 'TEXT_RAW', label: 'TEXT_RAW', type: 'text', operators: ['contains', 'eq', 'is_empty', 'is_not_empty'] },
  { key: 'URL', label: 'URL', type: 'text', operators: ['eq', 'contains', 'starts_with', 'ends_with'] },
  { key: 'USERID', label: 'USERID', type: 'text', operators: ['eq', 'ne', 'in', 'contains'] },
  { key: 'USERNAME', label: 'USERNAME', type: 'text', operators: ['eq', 'ne', 'contains', 'starts_with', 'ends_with', 'in'] },
  { key: 'IDSTR', label: 'IDSTR', type: 'text', operators: ['eq', 'ne', 'in'] },
  { key: 'MBLOGID', label: 'MBLOGID', type: 'text', operators: ['eq', 'ne', 'contains', 'is_empty', 'is_not_empty'] },
  { key: 'MSG_STR', label: 'MSG_STR', type: 'text', operators: ['contains', 'is_empty', 'is_not_empty'] },
]

const DEFAULT_OPERATOR_LABELS: Record<string, string> = {
  eq: '等于',
  ne: '不等于',
  contains: '包含',
  starts_with: '前缀匹配',
  ends_with: '后缀匹配',
  gte: '大于等于',
  lte: '小于等于',
  between: '区间',
  in: '包含任一',
  is_empty: '为空',
  is_not_empty: '不为空',
}

const TAB_PANEL_TITLES: Record<DeleteTab, string> = {
  builder: '条件查询',
  advanced_sql: 'SQL 查询',
  id_range: '消息 ID 区间',
  delivery_check: '消息检查',
}

const TAB_PANEL_DESCRIPTIONS: Record<DeleteTab, string> = {
  builder: '自定义条件查询消息，按post分组检查、删除消息',
  advanced_sql: '手写sql查询消息，按post分组检查、删除消息',
  id_range: '固定针对 chat_id=708424141 的 Telegram 消息 ID 区间做预览与逐条删除，不涉及数据库和文件处理。',
  delivery_check: '按 messages 表字段组合条件查询消息，再按 post 聚合检查发送完整性、顺序和重复情况，输出全部状态与记录。',
}

const TAB_LOG_FEATURES: Record<DeleteTab, string> = {
  builder: 'builder',
  advanced_sql: 'advanced_sql',
  id_range: 'id_range',
  delivery_check: 'delivery_check',
}

function createCondition(field = 'MESSAGE_ID', operator = 'gte'): QueryCondition {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    field,
    operator,
    value: '',
    value_to: '',
  }
}

async function postJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const result = (await response.json()) as MessageDeleteApiResponse<T>
  if (!response.ok || result.status !== 'success') {
    throw new Error(result.msg || `Request failed: ${response.status}`)
  }

  return result.data
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
    },
  })

  const result = (await response.json()) as MessageDeleteApiResponse<T>
  if (!response.ok || result.status !== 'success') {
    throw new Error(result.msg || `Request failed: ${response.status}`)
  }

  return result.data
}

export function MessageManagePage() {
  const pageInfo = mainPageInfo.messageDelete
  const [activeTab, setActiveTab] = useState<DeleteTab>('builder')
  const [relation, setRelation] = useState<RelationMode>('AND')
  const [queryFields, setQueryFields] = useState<QueryFieldConfig[]>(DEFAULT_QUERY_FIELDS)
  const [operatorLabels, setOperatorLabels] = useState<Record<string, string>>(DEFAULT_OPERATOR_LABELS)
  const [conditions, setConditions] = useState<QueryCondition[]>([createCondition()])
  const [whereClause, setWhereClause] = useState('')
  const [builderPreview, setBuilderPreview] = useState<SqlPreviewData | null>(null)
  const [advancedSqlPreview, setAdvancedSqlPreview] = useState<SqlPreviewData | null>(null)
  const [startId, setStartId] = useState('')
  const [endId, setEndId] = useState('')
  const [rangeCount, setRangeCount] = useState('')
  const [rangePreview, setRangePreview] = useState<RangePreviewData | null>(null)
  const [rangeResult, setRangeResult] = useState<RangeExecutionData | null>(null)
  const [rangeSortOrder, setRangeSortOrder] = useState<RangeSortOrder>('asc')
  const [deliveryResult, setDeliveryResult] = useState<DeliveryCheckData | null>(null)
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('non_complete')
  const [deliveryRelation, setDeliveryRelation] = useState<RelationMode>('AND')
  const [deliveryConditions, setDeliveryConditions] = useState<QueryCondition[]>([createCondition()])
  const [logs, setLogs] = useState<string[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<'sql-preview' | 'single-execute' | 'range-preview' | 'range-single-execute' | 'delivery-check' | 'logs' | 'meta' | ''>('')
  const [rangeConfirmed, setRangeConfirmed] = useState(false)
  const [executeModal, setExecuteModal] = useState<ExecuteModalState>(null)
  const [builderProcessedPosts, setBuilderProcessedPosts] = useState<Record<string, SinglePostExecutionData>>({})
  const [advancedProcessedPosts, setAdvancedProcessedPosts] = useState<Record<string, SinglePostExecutionData>>({})
  const [processedRangeMessages, setProcessedRangeMessages] = useState<Record<number, 'success' | 'failed'>>({})
  const [previewNotice, setPreviewNotice] = useState<PreviewNoticeState>(null)
  const [builderExpandedPosts, setBuilderExpandedPosts] = useState<ExpandedPostState>({})
  const [advancedExpandedPosts, setAdvancedExpandedPosts] = useState<ExpandedPostState>({})
  const [builderQuerySignature, setBuilderQuerySignature] = useState<string | null>(null)
  const [advancedQuerySignature, setAdvancedQuerySignature] = useState<string | null>(null)
  const [rangeQuerySignature, setRangeQuerySignature] = useState<string | null>(null)
  const [deliveryQuerySignature, setDeliveryQuerySignature] = useState<string | null>(null)
  const [builderPreviewPayload, setBuilderPreviewPayload] = useState<SqlPreviewPayload | null>(null)
  const [advancedPreviewPayload, setAdvancedPreviewPayload] = useState<SqlPreviewPayload | null>(null)

  const sqlPreview = activeTab === 'builder'
    ? builderPreview
    : activeTab === 'advanced_sql'
      ? advancedSqlPreview
      : null
  const processedPosts = activeTab === 'builder'
    ? builderProcessedPosts
    : activeTab === 'advanced_sql'
      ? advancedProcessedPosts
      : null
  const expandedPosts = activeTab === 'builder'
    ? builderExpandedPosts
    : activeTab === 'advanced_sql'
      ? advancedExpandedPosts
      : null
  const fieldMap = useMemo(() => Object.fromEntries(queryFields.map((field) => [field.key, field])), [queryFields])
  const builderPayload = useMemo<SqlPreviewPayload>(() => ({
    query_mode: 'builder',
    relation,
    conditions: conditions.map((item) => ({
      field: item.field,
      operator: item.operator,
      value: item.value,
      value_to: item.value_to,
    })),
  }), [conditions, relation])
  const advancedPayload = useMemo<SqlPreviewPayload>(() => ({
    query_mode: 'advanced',
    where_clause: whereClause,
  }), [whereClause])
  const builderCurrentSignature = useMemo(() => JSON.stringify(builderPayload), [builderPayload])
  const advancedCurrentSignature = useMemo(() => JSON.stringify(advancedPayload), [advancedPayload])
  const rangeCurrentSignature = useMemo(() => JSON.stringify({
    start_id: startId.trim(),
    end_id: endId.trim(),
    range_count: rangeCount.trim(),
  }), [endId, rangeCount, startId])
  const deliveryCurrentSignature = useMemo(() => JSON.stringify({
    relation: deliveryRelation,
    conditions: deliveryConditions.map((item) => ({
      field: item.field,
      operator: item.operator,
      value: item.value,
      value_to: item.value_to,
    })),
  }), [deliveryConditions, deliveryRelation])
  const builderPreviewVisible = Boolean(builderPreview) && builderQuerySignature === builderCurrentSignature
  const advancedPreviewVisible = Boolean(advancedSqlPreview) && advancedQuerySignature === advancedCurrentSignature
  const rangePreviewVisible = Boolean(rangePreview) && rangeQuerySignature === rangeCurrentSignature
  const deliveryResultVisible = Boolean(deliveryResult) && deliveryQuerySignature === deliveryCurrentSignature
  const sqlPreviewVisible = activeTab === 'builder' ? builderPreviewVisible : advancedPreviewVisible
  const sqlSummary = sqlPreviewVisible ? sqlPreview?.summary : null
  const rangeSummary = rangePreviewVisible ? rangePreview : null
  const sortedSqlGroups = useMemo(() => {
    if (!sqlPreview?.groups.length) {
      return []
    }

    const getSortKey = (group: SqlPreviewGroup) => (
      group.message_ids.length ? Math.min(...group.message_ids) : Number.MAX_SAFE_INTEGER
    )

    return [...sqlPreview.groups].sort((left, right) => {
      const keyDiff = getSortKey(left) - getSortKey(right)
      if (keyDiff !== 0) {
        return keyDiff
      }
      return left.post_key.localeCompare(right.post_key)
    })
  }, [sqlPreview])
  const processedSummary = useMemo(() => {
    if (!processedPosts) {
      return { posts: 0, messages: 0 }
    }

    return sortedSqlGroups.reduce(
      (summary, group) => {
        if (!processedPosts[group.post_key]) {
          return summary
        }

        return {
          posts: summary.posts + 1,
          messages: summary.messages + group.message_ids.length,
        }
      },
      { posts: 0, messages: 0 },
    )
  }, [processedPosts, sortedSqlGroups])
  const sortedRangeMessageIds = useMemo(() => {
    if (!rangePreview) {
      return []
    }

    const messageIds = [...rangePreview.message_ids]
    messageIds.sort((left, right) => (
      rangeSortOrder === 'asc' ? left - right : right - left
    ))
    return messageIds
  }, [rangePreview, rangeSortOrder])
  const rangeProcessedSummary = useMemo(() => {
    if (!rangePreview) {
      return {
        targetMessages: 0,
        processedMessages: 0,
        unprocessedMessages: 0,
      }
    }

    const processedMessages = rangePreview.message_ids.filter((messageId) => processedRangeMessages[messageId]).length

    return {
      targetMessages: rangePreview.message_count,
      processedMessages,
      unprocessedMessages: Math.max(rangePreview.message_count - processedMessages, 0),
    }
  }, [processedRangeMessages, rangePreview])
  const filteredDeliveryResults = useMemo(() => {
    if (!deliveryResultVisible || !deliveryResult) {
      return []
    }

    if (deliveryFilter === 'all') {
      return deliveryResult.results
    }

    if (deliveryFilter === 'non_complete') {
      return deliveryResult.results.filter((item) => item.status !== 'complete')
    }

    return deliveryResult.results.filter((item) => item.status === deliveryFilter)
  }, [deliveryFilter, deliveryResult, deliveryResultVisible])

  function getEffectiveField(condition: QueryCondition) {
    if (fieldMap[condition.field]) {
      return condition.field
    }
    return queryFields.find((f) => f.key === 'MESSAGE_ID')?.key ?? queryFields[0]?.key ?? DEFAULT_QUERY_FIELDS[0].key
  }

  function getEffectiveOperators(fieldKey: string) {
    return fieldMap[fieldKey]?.operators
      ?? DEFAULT_QUERY_FIELDS.find((field) => field.key === fieldKey)?.operators
      ?? ['eq']
  }

  function getEffectiveOperator(condition: QueryCondition, fieldKey: string) {
    const operators = getEffectiveOperators(fieldKey)
    if (operators.includes(condition.operator)) {
      return condition.operator
    }
    return operators[0] ?? 'eq'
  }

  function getSqlTab(tab: DeleteTab = activeTab): SqlQueryTab {
    return tab === 'advanced_sql' ? 'advanced_sql' : 'builder'
  }

  function setSqlPreviewForTab(tab: SqlQueryTab, preview: SqlPreviewData | null) {
    if (tab === 'advanced_sql') {
      setAdvancedSqlPreview(preview)
      return
    }
    setBuilderPreview(preview)
  }

  function clearProcessedPostsForTab(tab: SqlQueryTab) {
    if (tab === 'advanced_sql') {
      setAdvancedProcessedPosts({})
      return
    }
    setBuilderProcessedPosts({})
  }

  function updateProcessedPostsForTab(
    tab: SqlQueryTab,
    updater: (current: Record<string, SinglePostExecutionData>) => Record<string, SinglePostExecutionData>,
  ) {
    if (tab === 'advanced_sql') {
      setAdvancedProcessedPosts(updater)
      return
    }
    setBuilderProcessedPosts(updater)
  }

  function setQuerySignatureForTab(tab: SqlQueryTab, signature: string | null) {
    if (tab === 'advanced_sql') {
      setAdvancedQuerySignature(signature)
      return
    }
    setBuilderQuerySignature(signature)
  }

  function setPreviewPayloadForTab(tab: SqlQueryTab, payload: SqlPreviewPayload | null) {
    if (tab === 'advanced_sql') {
      setAdvancedPreviewPayload(payload)
      return
    }
    setBuilderPreviewPayload(payload)
  }

  function clearExpandedPostsForTab(tab: SqlQueryTab) {
    if (tab === 'advanced_sql') {
      setAdvancedExpandedPosts({})
      return
    }
    setBuilderExpandedPosts({})
  }

  function toggleExpandedPost(tab: SqlQueryTab, postKey: string) {
    const updater = (current: ExpandedPostState) => ({
      ...current,
      [postKey]: !current[postKey],
    })

    if (tab === 'advanced_sql') {
      setAdvancedExpandedPosts(updater)
      return
    }
    setBuilderExpandedPosts(updater)
  }

  function handlePreviewValueDoubleClick(event: ReactMouseEvent<HTMLElement>) {
    const selection = window.getSelection()
    if (!selection) {
      return
    }

    const range = document.createRange()
    range.selectNodeContents(event.currentTarget)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function handlePreviewItemDoubleClick(event: ReactMouseEvent<HTMLElement>) {
    event.stopPropagation()
    handlePreviewValueDoubleClick(event)
  }

  function handleTabChange(nextTab: DeleteTab) {
    setActiveTab(nextTab)
    setExecuteModal(null)
    setFeedback(null)
    setError(null)
    setPreviewNotice(null)
    void refreshLogs(nextTab)
  }

  async function refreshLogs(targetTab: DeleteTab = activeTab) {
    setLoading('logs')
    try {
      const feature = TAB_LOG_FEATURES[targetTab]
      const data = await getJson<MessageDeleteLogsResponse['data']>(`/api/niceme/message-delete/logs?feature=${encodeURIComponent(feature)}`)
      setLogs(data.lines)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '日志读取失败')
    } finally {
      setLoading('')
    }
  }

  async function clearLogs() {
    const confirmed = window.confirm('确认清理当前页面对应的日志吗？')
    if (!confirmed) {
      return
    }

    setLoading('logs')
    setError(null)
    setFeedback(null)
    setPreviewNotice(null)
    try {
      const feature = TAB_LOG_FEATURES[activeTab]
      const data = await postJson<MessageDeleteLogsResponse['data']>('/api/niceme/message-delete/logs/clear', {
        feature,
      })
      setLogs(data.lines)
      setPreviewNotice({
        message: '当前功能日志已清理。',
        token: Date.now(),
      })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '日志清理失败')
    } finally {
      setLoading('')
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadMeta() {
      setLoading('meta')
      try {
        const data = await getJson<QueryFieldsData>('/api/niceme/message-delete/query-fields')
        if (cancelled) {
          return
        }
        setQueryFields(data.fields)
        setOperatorLabels(data.operator_labels)
        setRelation(data.default_relation)
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : '查询字段加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading('')
        }
      }
    }

    void loadMeta()
    void refreshLogs(activeTab)

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!previewNotice) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setPreviewNotice((current) => (current?.token === previewNotice.token ? null : current))
    }, 3000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [previewNotice])

  useEffect(() => {
    if (!queryFields.length) {
      return
    }

    const defaultField = 'MESSAGE_ID'
    const defaultOperator = 'gte'

    setConditions((current) =>
      current.map((item) => {
        const nextField = fieldMap[item.field] ? item.field : defaultField
        const nextOperator = fieldMap[nextField]?.operators?.includes(item.operator)
          ? item.operator
          : (fieldMap[nextField]?.operators?.includes(defaultOperator) ? defaultOperator : (fieldMap[nextField]?.operators?.[0] ?? 'eq'))
        return {
          ...item,
          field: nextField,
          operator: nextOperator,
        }
      }),
    )

    setDeliveryConditions((current) =>
      current.map((item) => {
        const nextField = fieldMap[item.field] ? item.field : defaultField
        const nextOperator = fieldMap[nextField]?.operators?.includes(item.operator)
          ? item.operator
          : (fieldMap[nextField]?.operators?.includes(defaultOperator) ? defaultOperator : (fieldMap[nextField]?.operators?.[0] ?? 'eq'))
        return {
          ...item,
          field: nextField,
          operator: nextOperator,
        }
      }),
    )
  }, [fieldMap, queryFields])

  function updateCondition(id: string, patch: Partial<QueryCondition>) {
    setConditions((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item
        }
        const nextItem = { ...item, ...patch }
        if (patch.field) {
          const fieldConfig = fieldMap[patch.field]
          nextItem.operator = fieldConfig?.operators[0] ?? 'eq'
          nextItem.value = ''
          nextItem.value_to = ''
        }
        return nextItem
      }),
    )
  }

  function addCondition() {
    setConditions((current) => [...current, createCondition()])
  }

  function removeCondition(id: string) {
    setConditions((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : current))
  }

  function resetBuilderConditions() {
    setRelation('AND')
    setConditions([createCondition()])
    setBuilderPreview(null)
    setBuilderPreviewPayload(null)
    setBuilderProcessedPosts({})
    setBuilderExpandedPosts({})
    setBuilderQuerySignature(null)
    setFeedback(null)
    setError(null)
    setPreviewNotice(null)
  }

  function resetAdvancedSql() {
    setWhereClause('')
    setAdvancedSqlPreview(null)
    setAdvancedPreviewPayload(null)
    setAdvancedProcessedPosts({})
    setAdvancedExpandedPosts({})
    setAdvancedQuerySignature(null)
    setFeedback(null)
    setError(null)
    setPreviewNotice(null)
  }

  function updateDeliveryCondition(id: string, patch: Partial<QueryCondition>) {
    setDeliveryConditions((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item
        }
        const nextItem = { ...item, ...patch }
        if (patch.field) {
          const fieldConfig = fieldMap[patch.field]
          nextItem.operator = fieldConfig?.operators[0] ?? 'eq'
          nextItem.value = ''
          nextItem.value_to = ''
        }
        return nextItem
      }),
    )
  }

  function addDeliveryCondition() {
    setDeliveryConditions((current) => [...current, createCondition()])
  }

  function removeDeliveryCondition(id: string) {
    setDeliveryConditions((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : []))
  }

  function resetDeliveryFilters() {
    setDeliveryRelation('AND')
    setDeliveryConditions([createCondition()])
    setDeliveryResult(null)
    setDeliveryFilter('non_complete')
    setDeliveryQuerySignature(null)
    setFeedback(null)
    setError(null)
  }

  function buildSqlPayload(tab: SqlQueryTab = getSqlTab()) {
    return tab === 'advanced_sql' ? advancedPayload : builderPayload
  }

  async function previewSqlDelete() {
    const sqlTab = getSqlTab()
    const payload = buildSqlPayload(sqlTab)
    const querySignature = sqlTab === 'advanced_sql' ? advancedCurrentSignature : builderCurrentSignature

    setLoading('sql-preview')
    setError(null)
    setFeedback(null)
    setPreviewNotice(null)
    clearProcessedPostsForTab(sqlTab)
    clearExpandedPostsForTab(sqlTab)
    try {
      const data = await postJson<SqlPreviewData>('/api/niceme/message-delete/sql/preview', payload)
      setSqlPreviewForTab(sqlTab, data)
      setPreviewPayloadForTab(sqlTab, payload)
      setQuerySignatureForTab(sqlTab, querySignature)
      setPreviewNotice({
        message: `已生成删除预览，共 ${data.summary.target_posts} 个 post、${data.summary.target_messages} 条消息。`,
        token: Date.now(),
      })
      await refreshLogs()
    } catch (requestError) {
      setSqlPreviewForTab(sqlTab, null)
      setPreviewPayloadForTab(sqlTab, null)
      setQuerySignatureForTab(sqlTab, null)
      setError(requestError instanceof Error ? requestError.message : '预览失败')
    } finally {
      setLoading('')
    }
  }

  async function executeSinglePostDelete() {
    if (!executeModal) {
      return
    }
    if (!executeModal.deleteTelegram && !executeModal.deleteFiles && !executeModal.deleteDb) {
      setError('至少选择一项删除操作。')
      return
    }

    const executePayload = executeModal.queryTab === 'advanced_sql' ? advancedPreviewPayload : builderPreviewPayload
    if (!executePayload) {
      setError('查询条件已变化，请重新生成预览后再执行删除。')
      return
    }

    const confirmed = window.confirm(`确认处理 post_key=${executeModal.postKey} 吗？`)
    if (!confirmed) {
      return
    }

    setLoading('single-execute')
    setError(null)
    setFeedback(null)
    try {
      const data = await postJson<SinglePostExecutionData>('/api/niceme/message-delete/sql/execute-single', {
        ...executePayload,
        post_key: executeModal.postKey,
        execute_options: {
          delete_telegram: executeModal.deleteTelegram,
          delete_files: executeModal.deleteFiles,
          delete_db: executeModal.deleteDb,
        },
        confirm_execute: true,
      })
      updateProcessedPostsForTab(executeModal.queryTab, (current) => ({ ...current, [data.post_key]: data }))
      setExecuteModal(null)
      setFeedback(`已处理 ${data.post_key}。`)
      await refreshLogs()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '单条执行失败')
      await refreshLogs()
    } finally {
      setLoading('')
    }
  }

  async function previewRangeDelete() {
    setLoading('range-preview')
    setError(null)
    setFeedback(null)
    setPreviewNotice(null)
    setRangeResult(null)
    setProcessedRangeMessages({})
    try {
      const trimmedStartId = startId.trim()
      const trimmedEndId = endId.trim()
      const trimmedCount = rangeCount.trim()
      const useLatestMessages = !trimmedStartId && !trimmedEndId && !trimmedCount

      let requestPayload: { start_id?: number, end_id?: number } = {}

      if (!useLatestMessages) {
        const normalizedStartId = Number.parseInt(trimmedStartId, 10)
        const normalizedEndId = trimmedEndId ? Number.parseInt(trimmedEndId, 10) : NaN
        const normalizedCount = trimmedCount ? Number.parseInt(trimmedCount, 10) : NaN

        if (Number.isNaN(normalizedStartId)) {
          throw new Error('开始消息 ID 必须是整数')
        }

        let resolvedEndId = normalizedEndId
        if (Number.isNaN(resolvedEndId)) {
          if (Number.isNaN(normalizedCount) || normalizedCount <= 0) {
            throw new Error('结束消息 ID 和想删除的消息数量至少填写一个')
          }
          resolvedEndId = normalizedStartId + normalizedCount - 1
        }

        requestPayload = {
          start_id: normalizedStartId,
          end_id: resolvedEndId,
        }
      }

      const data = await postJson<RangePreviewData>('/api/niceme/message-delete/id-range/preview', requestPayload)
      setRangePreview(data)
      setRangeQuerySignature(useLatestMessages
        ? JSON.stringify({ start_id: '', end_id: '', range_count: '' })
        : JSON.stringify({
            start_id: String(data.start_id),
            end_id: String(data.end_id),
            range_count: String(data.message_count),
          }))
      setRangeSortOrder('asc')
      setStartId(String(data.start_id))
      setEndId(String(data.end_id))
      setRangeCount(String(data.message_count))
      setPreviewNotice({
        message: useLatestMessages
          ? `未填写区间，已自动加载最新 ${data.message_count} 条 Telegram 消息。`
          : `已生成 ID 区间预览，共 ${data.message_count} 条 Telegram 消息。`,
        token: Date.now(),
      })
      await refreshLogs()
    } catch (requestError) {
      setRangePreview(null)
      setRangeQuerySignature(null)
      setError(requestError instanceof Error ? requestError.message : 'ID 区间预览失败')
    } finally {
      setLoading('')
    }
  }

  async function executeSingleRangeDelete(messageId: number) {
    if (!rangePreview) {
      setError('请先生成 ID 区间预览。')
      return
    }

    if (!rangeConfirmed) {
      const confirmed = window.confirm(
        `确认删除 chat_id=${rangePreview.chat_id} 中的消息 ${messageId} 吗？`,
      )
      if (!confirmed) {
        return
      }
    }

    setLoading('range-single-execute')
    setError(null)
    setFeedback(null)
    try {
      const data = await postJson<RangeExecutionData>('/api/niceme/message-delete/id-range/execute', {
        start_id: messageId,
        end_id: messageId,
        confirm_execute: true,
      })
      setRangeResult(data)
      setProcessedRangeMessages((current) => ({
        ...current,
        [messageId]: data.summary.telegram_failed > 0 ? 'failed' : 'success',
      }))
      setFeedback(`消息 ${messageId} 删除执行完成。`)
      await refreshLogs()
    } catch (requestError) {
      setProcessedRangeMessages((current) => ({
        ...current,
        [messageId]: 'failed',
      }))
      setError(requestError instanceof Error ? requestError.message : 'ID 区间执行失败')
      await refreshLogs()
    } finally {
      setLoading('')
    }
  }

  async function runDeliveryCheck() {
    setLoading('delivery-check')
    setError(null)
    setFeedback(null)
    setPreviewNotice(null)
    try {
      const data = await postJson<DeliveryCheckData>('/api/niceme/message-delete/delivery-check', {
        relation: deliveryRelation,
        conditions: deliveryConditions
          .filter((item) => item.field && item.operator)
          .filter((item) => item.operator === 'is_empty' || item.operator === 'is_not_empty' || String(item.value ?? '').trim() || String(item.value_to ?? '').trim())
          .map((item) => ({
            field: item.field,
            operator: item.operator,
            value: item.value,
            value_to: item.value_to,
          })),
      })
      setDeliveryResult(data)
      setDeliveryFilter('non_complete')
      setDeliveryQuerySignature(deliveryCurrentSignature)
      setPreviewNotice({
        message: `消息检查完成，共扫描 ${data.summary.total_posts} 个 post。`,
        token: Date.now(),
      })
      await refreshLogs()
    } catch (requestError) {
      setDeliveryResult(null)
      setDeliveryQuerySignature(null)
      setError(requestError instanceof Error ? requestError.message : '消息检查失败')
    } finally {
      setLoading('')
    }
  }

  return (
    <section className="page">
      <PageIntro
        eyebrow={pageInfo.eyebrow}
        title={<h3>{pageInfo.title}</h3>}
        description={pageInfo.description}
      />

      {feedback ? <div className="info-banner">{feedback}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {previewNotice ? (
        <div className="save-result-modal-backdrop" aria-live="polite">
          <section className="save-result-modal save-result-modal-success delete-feedback-toast" role="status">
            <p className="delete-feedback-toast-message">{previewNotice.message}</p>
          </section>
        </div>
      ) : null}

      {executeModal ? (
        <div className="save-result-modal-backdrop" role="presentation" onClick={() => setExecuteModal(null)}>
          <section className="delete-confirm-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <h4>确认删除 {executeModal.postKey}</h4>
            </div>
            <div className="delete-option-grid">
              <label className="delete-check">
                <input
                  type="checkbox"
                  checked={executeModal.deleteTelegram}
                  onChange={(event) => setExecuteModal((current) => current ? { ...current, deleteTelegram: event.target.checked } : current)}
                />
                <span>删除 Telegram 消息</span>
              </label>
              <label className="delete-check">
                <input
                  type="checkbox"
                  checked={executeModal.deleteFiles}
                  onChange={(event) => setExecuteModal((current) => current ? { ...current, deleteFiles: event.target.checked } : current)}
                />
                <span>删除文件</span>
              </label>
              <label className="delete-check">
                <input
                  type="checkbox"
                  checked={executeModal.deleteDb}
                  onChange={(event) => setExecuteModal((current) => current ? { ...current, deleteDb: event.target.checked } : current)}
                />
                <span>删除数据库记录</span>
              </label>
            </div>
            <div className="delete-action-row">
              <button type="button" className="header-button" onClick={() => setExecuteModal(null)}>
                取消
              </button>
              <button
                type="button"
                className="delete-danger-button"
                onClick={() => void executeSinglePostDelete()}
                disabled={loading === 'single-execute'}
              >
                {loading === 'single-execute' ? '执行中...' : '确认执行删除'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="dashboard-section">
        <div className="section-content">
          <div className="delete-tab-strip">
            <button
              type="button"
              className={`delete-tab-button${activeTab === 'delivery_check' ? ' is-active' : ''}`}
              onClick={() => handleTabChange('delivery_check')}
            >
              消息检查
            </button>
            <button
              type="button"
              className={`delete-tab-button${activeTab === 'builder' ? ' is-active' : ''}`}
              onClick={() => handleTabChange('builder')}
            >
              条件查询
            </button>
            <button
              type="button"
              className={`delete-tab-button${activeTab === 'advanced_sql' ? ' is-active' : ''}`}
              onClick={() => handleTabChange('advanced_sql')}
            >
              SQL 查询
            </button>
            <button
              type="button"
              className={`delete-tab-button${activeTab === 'id_range' ? ' is-active' : ''}`}
              onClick={() => handleTabChange('id_range')}
            >
              消息 ID 区间
            </button>
          </div>

          {activeTab === 'builder' || activeTab === 'advanced_sql' ? (
            <div className="delete-page-grid">
              <section className="panel delete-form-panel">
                {activeTab === 'advanced_sql' ? (
                  <div className="panel-head">
                    <h4>{TAB_PANEL_TITLES.advanced_sql}</h4>
                    <p className="delete-panel-note">{TAB_PANEL_DESCRIPTIONS.advanced_sql}</p>
                  </div>
                ) : null}

                {activeTab === 'builder' ? (
                  <>
                    <div className="panel-head">
                      <h4>{TAB_PANEL_TITLES.builder}</h4>
                      <p className="delete-panel-note">{TAB_PANEL_DESCRIPTIONS.builder}</p>
                    </div>
                    <div className="delete-builder-list">
                      {conditions.map((condition, index) => {
                        const effectiveField = getEffectiveField(condition)
                        const effectiveOperators = getEffectiveOperators(effectiveField)
                        const effectiveOperator = getEffectiveOperator(condition, effectiveField)
                        const requiresSecondValue = effectiveOperator === 'between'
                        const usesNoValue = effectiveOperator === 'is_empty' || effectiveOperator === 'is_not_empty'

                        return (
                          <article key={condition.id} className="delete-condition-card">
                            <div className="delete-condition-row">
                              <span className="delete-condition-index">条件 {index + 1}</span>
                              <label className="delete-field delete-field-inline">
                                <select value={effectiveField} onChange={(event) => updateCondition(condition.id, { field: event.target.value })}>
                                  {queryFields.map((field) => (
                                    <option key={field.key} value={field.key}>
                                      {field.key}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="delete-field delete-field-inline">
                                <select
                                  value={effectiveOperator}
                                  onChange={(event) => updateCondition(condition.id, { operator: event.target.value, value: '', value_to: '' })}
                                >
                                  {effectiveOperators.map((operator) => (
                                    <option key={operator} value={operator}>
                                      {operatorLabels[operator] ?? operator}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {!usesNoValue ? (
                                <label className="delete-field delete-field-inline delete-field-value">
                                  <textarea
                                    className="delete-textarea delete-textarea-inline"
                                    value={condition.value}
                                    onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                                    placeholder={effectiveOperator === 'in' ? '值列表，每行一个' : '值'}
                                  />
                                </label>
                              ) : null}
                              {requiresSecondValue ? (
                                <label className="delete-field delete-field-inline delete-field-value">
                                  <input
                                    value={condition.value_to ?? ''}
                                    onChange={(event) => updateCondition(condition.id, { value_to: event.target.value })}
                                    placeholder="结束值"
                                  />
                                </label>
                              ) : null}
                              <button type="button" className="reset-button delete-inline-remove" onClick={() => removeCondition(condition.id)}>
                                删除
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <label className="delete-field delete-sql-field">
                      <span className="delete-sql-prefix">SELECT MESSAGE_ID FROM messages WHERE</span>
                      <textarea
                        className="delete-textarea delete-sql-textarea"
                        value={whereClause}
                        onChange={(event) => setWhereClause(event.target.value)}
                        placeholder="USERNAME LIKE '%test%' AND USERID='123456' AND DATE_TIME >= '2026-04-01 00:00:00'"
                      />
                      <span className="delete-sql-hint">常用 WHERE 字段：USERNAME、USERID、IDSTR、URL、CAPTION、DATE_TIME、MESSAGE_ID、CHAT_ID、MEDIA_GROUP_ID、TEXT_RAW、MSG_STR。这里只需要填写 WHERE 后面的条件。</span>
                    </label>
                  </>
                )}

                <div className="delete-action-row">
                  {activeTab === 'builder' ? (
                    <>
                      <label className="delete-field delete-field-inline delete-builder-action-select">
                        <select value={relation} onChange={(event) => setRelation(event.target.value as RelationMode)}>
                          <option value="AND">全部满足</option>
                          <option value="OR">任一满足</option>
                        </select>
                      </label>
                      <button type="button" className="header-button" onClick={addCondition} disabled={loading !== ''}>
                        添加条件
                      </button>
                      <button type="button" className="reset-button" onClick={resetBuilderConditions} disabled={loading !== ''}>
                        重置
                      </button>
                      <button type="button" className="header-button delete-query-button" onClick={() => void previewSqlDelete()} disabled={loading !== ''}>
                        {loading === 'sql-preview' ? '查询中...' : '查询'}
                      </button>
                    </>
                  ) : activeTab === 'advanced_sql' ? (
                    <>
                      <button type="button" className="reset-button" onClick={resetAdvancedSql} disabled={loading !== ''}>
                        重置
                      </button>
                      <button type="button" className="header-button delete-query-button" onClick={() => void previewSqlDelete()} disabled={loading !== ''}>
                        {loading === 'sql-preview' ? '查询中...' : '查询'}
                      </button>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="panel delete-preview-panel">
                <div className="panel-head">
                  <h4>预览摘要</h4>
                </div>
                {sqlSummary ? (
                  <>
                    <div className="delete-summary-grid delete-summary-grid-delivery">
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">POST</p>
                        <strong className="dashboard-card-value">{sqlSummary.target_posts}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">目标消息</p>
                        <strong className="dashboard-card-value">{sqlSummary.target_messages}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">已处理消息</p>
                        <strong className="dashboard-card-value">{processedSummary.messages}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">已处理 POST</p>
                        <strong className="dashboard-card-value">{processedSummary.posts}</strong>
                      </article>
                    </div>

                    <div className="delete-preview-list">
                      {sortedSqlGroups.map((group, index) => {
                        const processed = processedPosts?.[group.post_key]
                        const expanded = Boolean(expandedPosts?.[group.post_key])
                        return (
                          <article key={`${group.post_key}-${index}`} className={`delete-preview-item${processed ? ' is-processed' : ''}`}>
                            <div className="delete-preview-head">
                              <span>{group.username || '未知用户'}</span>
                              <button
                                type="button"
                                className={`delete-preview-corner${expanded ? ' is-expanded' : ''}`}
                                onClick={() => toggleExpandedPost(getSqlTab(), group.post_key)}
                                title={expanded ? '点击收起详情' : '点击展开详情'}
                                aria-label={expanded ? `收起 ${group.post_key} 详情` : `展开 ${group.post_key} 详情`}
                              >
                                {index + 1}
                              </button>
                            </div>
                            <div className="delete-preview-field">
                              <span className="delete-preview-label">IDSTR</span>
                              <div className="delete-preview-value">{group.idstr || '-'}</div>
                            </div>
                            <div className="delete-preview-field">
                              <span className="delete-preview-label">USERID</span>
                              <div className="delete-preview-value">{group.userid || '-'}</div>
                            </div>
                            <div className="delete-preview-field">
                              <span className="delete-preview-label">URL</span>
                              <div className="delete-preview-value">
                                {group.url ? (
                                  <a className="delete-preview-link" href={group.url} target="_blank" rel="noreferrer">{group.url}</a>
                                ) : '-'}
                              </div>
                            </div>
                            <div className="delete-preview-field">
                              <span className="delete-preview-label">MESSAGE_IDS</span>
                              <div className="delete-preview-value">{group.message_ids.join(', ') || '-'}</div>
                            </div>
                            {processed ? (
                              <div className="delete-preview-actions delete-preview-actions-between">
                                <span className="delete-processed-tag">已处理</span>
                              </div>
                            ) : null}
                            {expanded ? (
                              <>
                                <div className="delete-preview-field">
                                  <span className="delete-preview-label">FILES</span>
                                  {group.file_candidates.length ? (
                                    <div className="delete-preview-value delete-preview-inline-list delete-file-inline-list">
                                      {group.file_candidates.map((item, itemIndex) => {
                                        const fileContent = item.status === 'found' ? item.path : item.name
                                        const isLastItem = itemIndex === group.file_candidates.length - 1
                                        return (
                                          <span key={`${group.post_key}-${itemIndex}-${fileContent}`}>
                                            <span
                                              className={`delete-file-item delete-file-item-${item.status}`}
                                              onDoubleClick={handlePreviewItemDoubleClick}
                                              title="双击选中后可直接复制"
                                            >
                                              {fileContent}
                                            </span>
                                            {isLastItem ? null : <span className="delete-inline-separator">, </span>}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <div className="delete-preview-value">-</div>
                                  )}
                                </div>
                                {!processed ? (
                                  <div className="delete-preview-actions">
                                    <button
                                      type="button"
                                      className="delete-danger-button"
                                      onClick={() => setExecuteModal({
                                        postKey: group.post_key,
                                        queryTab: getSqlTab(),
                                        deleteTelegram: true,
                                        deleteFiles: true,
                                        deleteDb: false,
                                      })}
                                    >
                                      确认删除
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className="table-empty-state">设置条件后点击“查询”，在右侧逐条确认删除。</div>
                )}
              </section>
            </div>
          ) : activeTab === 'id_range' ? (
            <div className="delete-page-grid delete-page-grid-range">
              <section className="panel delete-form-panel">
                <div className="panel-head">
                  <h4>{TAB_PANEL_TITLES.id_range}</h4>
                  <p className="delete-panel-note">{TAB_PANEL_DESCRIPTIONS.id_range}</p>
                </div>
                <div className="delete-inline-fields delete-inline-fields-range">
                  <label className="delete-field">
                    <span>开始消息 ID</span>
                    <input value={startId} onChange={(event) => setStartId(event.target.value)} placeholder="例如 12341" />
                  </label>
                  <label className="delete-field">
                    <span>结束消息 ID</span>
                    <input value={endId} onChange={(event) => setEndId(event.target.value)} placeholder="例如 12345" />
                  </label>
                  <label className="delete-field">
                    <span>想删除的消息数量</span>
                    <input value={rangeCount} onChange={(event) => setRangeCount(event.target.value)} placeholder="例如 50" />
                  </label>
                  <div className="delete-range-query-wrap">
                    <button type="button" className="header-button" onClick={() => void previewRangeDelete()} disabled={loading !== ''}>
                      {loading === 'range-preview' ? '查询中...' : '查询'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="panel delete-preview-panel">
                <div className="panel-head">
                  <h4>区间预览</h4>
                  <div className="delete-preview-panel-actions">
                    <button
                      type="button"
                      className="header-button"
                      onClick={() => setRangeSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))}
                    >
                      {rangeSortOrder === 'asc' ? '排序：从小到大' : '排序：从大到小'}
                    </button>
                    <label className="delete-check delete-check-danger">
                      <input type="checkbox" checked={rangeConfirmed} onChange={(event) => setRangeConfirmed(event.target.checked)} />
                      <span>开启后点击删除按钮直接执行，不再二次确认</span>
                    </label>
                  </div>
                </div>
                {rangeSummary ? (
                  <>
                    <div className="delete-summary-grid">
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">CHAT_ID</p>
                        <strong className="dashboard-card-value">{rangeSummary.chat_id}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">目标消息</p>
                        <strong className="dashboard-card-value">{rangeProcessedSummary.targetMessages}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">已处理消息</p>
                        <strong className="dashboard-card-value">{rangeProcessedSummary.processedMessages}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">未处理消息</p>
                        <strong className="dashboard-card-value">{rangeProcessedSummary.unprocessedMessages}</strong>
                      </article>
                    </div>

                    <div className="delete-range-list">
                      {sortedRangeMessageIds.map((messageId) => {
                        const state = processedRangeMessages[messageId]
                        return (
                          <article
                            key={messageId}
                            className={`delete-range-item${state === 'success' ? ' is-processed' : ''}${state === 'failed' ? ' is-failed' : ''}`}
                          >
                            <div className="delete-range-item-meta">
                              <strong>{messageId}</strong>
                              {state === 'success' ? <span className="delete-processed-tag">已删除</span> : null}
                              {state === 'failed' ? <span className="delete-failed-tag">失败</span> : null}
                            </div>
                            <button
                              type="button"
                              className="delete-danger-button"
                              onClick={() => void executeSingleRangeDelete(messageId)}
                              disabled={loading === 'range-single-execute' || state === 'success'}
                            >
                              {loading === 'range-single-execute' ? '删除中...' : '删除'}
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className="table-empty-state">输入开始和结束消息 ID 后点击“查询”。</div>
                )}
              </section>
            </div>
          ) : (
            <div className="delete-page-grid">
              <section className="panel delete-form-panel">
                <div className="panel-head">
                  <h4>{TAB_PANEL_TITLES.delivery_check}</h4>
                  <p className="delete-panel-note">{TAB_PANEL_DESCRIPTIONS.delivery_check}</p>
                </div>
                <div className="delete-builder-list">
                  {deliveryConditions.map((condition, index) => {
                    const effectiveField = getEffectiveField(condition)
                    const effectiveOperators = getEffectiveOperators(effectiveField)
                    const effectiveOperator = getEffectiveOperator(condition, effectiveField)
                    const requiresSecondValue = effectiveOperator === 'between'
                    const usesNoValue = effectiveOperator === 'is_empty' || effectiveOperator === 'is_not_empty'

                    return (
                      <article key={condition.id} className="delete-condition-card">
                        <div className="delete-condition-row">
                          <span className="delete-condition-index">条件 {index + 1}</span>
                          <label className="delete-field delete-field-inline">
                            <select value={effectiveField} onChange={(event) => updateDeliveryCondition(condition.id, { field: event.target.value })}>
                              {queryFields.map((field) => (
                                <option key={field.key} value={field.key}>
                                  {field.key}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="delete-field delete-field-inline">
                            <select
                              value={effectiveOperator}
                              onChange={(event) => updateDeliveryCondition(condition.id, { operator: event.target.value, value: '', value_to: '' })}
                            >
                              {effectiveOperators.map((operator) => (
                                <option key={operator} value={operator}>
                                  {operatorLabels[operator] ?? operator}
                                </option>
                              ))}
                            </select>
                          </label>
                          {!usesNoValue ? (
                            <label className="delete-field delete-field-inline delete-field-value">
                              <textarea
                                className="delete-textarea delete-textarea-inline"
                                value={condition.value}
                                onChange={(event) => updateDeliveryCondition(condition.id, { value: event.target.value })}
                                placeholder={effectiveOperator === 'in' ? '值列表，每行一个' : '值'}
                              />
                            </label>
                          ) : null}
                          {requiresSecondValue ? (
                            <label className="delete-field delete-field-inline delete-field-value">
                              <input
                                value={condition.value_to ?? ''}
                                onChange={(event) => updateDeliveryCondition(condition.id, { value_to: event.target.value })}
                                placeholder="结束值"
                              />
                            </label>
                          ) : null}
                          <button type="button" className="reset-button delete-inline-remove" onClick={() => removeDeliveryCondition(condition.id)}>
                            删除
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
                <div className="delete-action-row">
                  <label className="delete-field delete-field-inline delete-builder-action-select">
                    <select value={deliveryRelation} onChange={(event) => setDeliveryRelation(event.target.value as RelationMode)}>
                      <option value="AND">全部满足</option>
                      <option value="OR">任一满足</option>
                    </select>
                  </label>
                  <button type="button" className="header-button" onClick={addDeliveryCondition} disabled={loading !== ''}>
                    添加条件
                  </button>
                  <button type="button" className="reset-button" onClick={resetDeliveryFilters} disabled={loading !== ''}>
                    重置
                  </button>
                  <button type="button" className="header-button delete-query-button" onClick={() => void runDeliveryCheck()} disabled={loading !== ''}>
                    {loading === 'delivery-check' ? '检查中...' : '开始检查'}
                  </button>
                </div>
              </section>

              <section className="panel delete-preview-panel">
                <div className="panel-head">
                  <h4>检查结果</h4>
                </div>
                {deliveryResultVisible && deliveryResult ? (
                  <>
                    <div className="delete-summary-grid delete-summary-grid-delivery">
                      <button
                        type="button"
                        className={`dashboard-card delete-summary-card delete-summary-filter-card${deliveryFilter === 'all' ? ' is-active' : ''}`}
                        onClick={() => setDeliveryFilter('all')}
                      >
                        <p className="dashboard-card-title">总 Post</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.total_posts}</strong>
                      </button>
                      <button
                        type="button"
                        className={`dashboard-card delete-summary-card delete-summary-filter-card${deliveryFilter === 'complete' ? ' is-active' : ''}`}
                        onClick={() => setDeliveryFilter('complete')}
                      >
                        <p className="dashboard-card-title">完整发送</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.complete}</strong>
                      </button>
                      <button
                        type="button"
                        className={`dashboard-card delete-summary-card delete-summary-filter-card${deliveryFilter === 'misordered' || deliveryFilter === 'non_complete' ? ' is-active' : ''}`}
                        onClick={() => setDeliveryFilter('misordered')}
                      >
                        <p className="dashboard-card-title">错位发送</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.misordered}</strong>
                      </button>
                      <button
                        type="button"
                        className={`dashboard-card delete-summary-card delete-summary-filter-card${deliveryFilter === 'missing' || deliveryFilter === 'non_complete' ? ' is-active' : ''}`}
                        onClick={() => setDeliveryFilter('missing')}
                      >
                        <p className="dashboard-card-title">漏发送</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.missing}</strong>
                      </button>
                      <button
                        type="button"
                        className={`dashboard-card delete-summary-card delete-summary-filter-card${deliveryFilter === 'duplicate_send' || deliveryFilter === 'non_complete' ? ' is-active' : ''}`}
                        onClick={() => setDeliveryFilter('duplicate_send')}
                      >
                        <p className="dashboard-card-title">重复发送</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.duplicate_send}</strong>
                      </button>
                      <button
                        type="button"
                        className={`dashboard-card delete-summary-card delete-summary-filter-card${deliveryFilter === 'unknown' || deliveryFilter === 'non_complete' ? ' is-active' : ''}`}
                        onClick={() => setDeliveryFilter('unknown')}
                      >
                        <p className="dashboard-card-title">未知</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.unknown}</strong>
                      </button>
                    </div>
                    <div className="delete-preview-list">
                      {filteredDeliveryResults.length ? (
                        filteredDeliveryResults.map((item) => (
                          <article key={item.post_key} className={`delete-preview-item delivery-status-${item.status}`}>
                            <div className="delete-preview-head">
                              <strong>{item.status_label}</strong>
                              <span>{item.username || '未知用户'}</span>
                            </div>
                            <p><span>IDSTR</span>{item.idstr || '-'}</p>
                            <p><span>MBLOGID</span>{item.mblogid || '-'}</p>
                            <p><span>USERID</span>{item.userid || '-'}</p>
                            <p>
                              <span>URL</span>
                              {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a> : '-'}
                            </p>
                            <p><span>ORDERED_TYPES</span>{item.ordered_types.join(' -> ') || '-'}</p>
                            <p><span>MESSAGE_IDS</span>{item.message_ids.join(', ') || '-'}</p>
                          </article>
                        ))
                      ) : (
                        <div className="table-empty-state">当前筛选条件下没有需要输出的 post。</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="table-empty-state">设置条件后点击“开始检查”。如果不填任何条件，会检查最近 56 小时的所有消息并按 DATE_TIME 处理。</div>
                )}
              </section>
            </div>
          )}
        </div>
      </section>

      {activeTab !== 'delivery_check' ? (
      <section className="dashboard-section">
        <button type="button" className="section-header theme-table">
          <span className="section-title-group">
            <span className="drag-handle">⋮⋮</span>
            <span className="section-title">执行结果</span>
          </span>
        </button>
        <div className="section-content">
          {Object.keys(processedPosts ?? {}).length > 0 || rangeResult ? (
            <div className="delete-result-grid">
              {rangeResult
                ? Object.entries(rangeResult.summary).map(([key, value]) => (
                    <article key={key} className="dashboard-card delete-summary-card">
                      <p className="dashboard-card-title">{key}</p>
                      <strong className="dashboard-card-value">{String(value)}</strong>
                    </article>
                  ))
                : Object.entries(processedPosts ?? {}).map(([postKey, result]) => (
                    <article key={postKey} className="dashboard-card delete-summary-card">
                      <p className="dashboard-card-title">{postKey}</p>
                      <strong className="delete-summary-text">
                        TG {result.summary.telegram_deleted} / FILE {result.summary.files_deleted} / DB {result.summary.db_deleted}
                      </strong>
                    </article>
                  ))}
            </div>
          ) : (
            <div className="table-empty-state">执行删除后，这里会显示成功/失败统计。</div>
          )}
        </div>
      </section>
      ) : null}

      <section className="dashboard-section">
        <div className="section-header theme-table delete-log-section-header">
          <span className="section-title-group">
            <span className="drag-handle">⋮⋮</span>
            <span className="section-title">执行日志</span>
          </span>
          <div className="delete-log-header-actions">
            <button type="button" className="header-button" onClick={() => void refreshLogs(activeTab)} disabled={loading === 'logs'}>
              {loading === 'logs' ? '刷新中...' : '刷新'}
            </button>
            <button type="button" className="reset-button" onClick={() => void clearLogs()} disabled={loading === 'logs'}>
              {loading === 'logs' ? '处理中...' : '清理日志'}
            </button>
          </div>
        </div>
        <div className="section-content">
          <div className="delete-log-shell">
            <pre className="delete-log-output">{logs.length ? logs.join('\n') : '暂无日志输出'}</pre>
          </div>
        </div>
      </section>
    </section>
  )
}
