import { useEffect, useMemo, useState } from 'react'
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
  SqlPreviewData,
} from '../lib/message-delete'

type DeleteTab = 'builder' | 'advanced_sql' | 'id_range' | 'delivery_check'
type RelationMode = 'AND' | 'OR'

type ExecuteModalState = {
  postKey: string
  deleteTelegram: boolean
  deleteFiles: boolean
  deleteDb: boolean
} | null

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

function createCondition(field = 'USERNAME', operator = 'contains'): QueryCondition {
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

export function MessageDeletePage() {
  const pageInfo = mainPageInfo.messageDelete
  const [activeTab, setActiveTab] = useState<DeleteTab>('builder')
  const [relation, setRelation] = useState<RelationMode>('AND')
  const [queryFields, setQueryFields] = useState<QueryFieldConfig[]>(DEFAULT_QUERY_FIELDS)
  const [operatorLabels, setOperatorLabels] = useState<Record<string, string>>(DEFAULT_OPERATOR_LABELS)
  const [conditions, setConditions] = useState<QueryCondition[]>([createCondition()])
  const [whereClause, setWhereClause] = useState('')
  const [sqlPreview, setSqlPreview] = useState<SqlPreviewData | null>(null)
  const [startId, setStartId] = useState('')
  const [endId, setEndId] = useState('')
  const [rangeCount, setRangeCount] = useState('')
  const [rangePreview, setRangePreview] = useState<RangePreviewData | null>(null)
  const [rangeResult, setRangeResult] = useState<RangeExecutionData | null>(null)
  const [deliveryResult, setDeliveryResult] = useState<DeliveryCheckData | null>(null)
  const [deliveryRelation, setDeliveryRelation] = useState<RelationMode>('AND')
  const [deliveryConditions, setDeliveryConditions] = useState<QueryCondition[]>([createCondition()])
  const [logs, setLogs] = useState<string[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<'sql-preview' | 'single-execute' | 'range-preview' | 'range-single-execute' | 'delivery-check' | 'logs' | 'meta' | ''>('')
  const [rangeConfirmed, setRangeConfirmed] = useState(false)
  const [executeModal, setExecuteModal] = useState<ExecuteModalState>(null)
  const [processedPosts, setProcessedPosts] = useState<Record<string, SinglePostExecutionData>>({})
  const [processedRangeMessages, setProcessedRangeMessages] = useState<Record<number, 'success' | 'failed'>>({})

  const sqlSummary = sqlPreview?.summary
  const rangeSummary = rangePreview
  const fieldMap = useMemo(() => Object.fromEntries(queryFields.map((field) => [field.key, field])), [queryFields])

  function getEffectiveField(condition: QueryCondition) {
    if (fieldMap[condition.field]) {
      return condition.field
    }
    return queryFields[0]?.key ?? DEFAULT_QUERY_FIELDS[0].key
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
    try {
      const feature = TAB_LOG_FEATURES[activeTab]
      const data = await postJson<MessageDeleteLogsResponse['data']>('/api/niceme/message-delete/logs/clear', {
        feature,
      })
      setLogs(data.lines)
      setFeedback('当前功能日志已清理。')
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
    void refreshLogs(activeTab)
  }, [activeTab])

  useEffect(() => {
    if (!queryFields.length) {
      return
    }

    const defaultField = queryFields[0]?.key ?? 'USERNAME'
    const defaultOperator = fieldMap[defaultField]?.operators?.[0] ?? 'eq'

    setConditions((current) =>
      current.map((item) => {
        const nextField = fieldMap[item.field] ? item.field : defaultField
        const nextOperator = fieldMap[nextField]?.operators?.includes(item.operator)
          ? item.operator
          : (fieldMap[nextField]?.operators?.[0] ?? defaultOperator)
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
          : (fieldMap[nextField]?.operators?.[0] ?? defaultOperator)
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
    setSqlPreview(null)
    setProcessedPosts({})
    setFeedback(null)
    setError(null)
  }

  function resetAdvancedSql() {
    setWhereClause('')
    setSqlPreview(null)
    setProcessedPosts({})
    setFeedback(null)
    setError(null)
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
    setFeedback(null)
    setError(null)
  }

  function buildSqlPayload() {
    return activeTab === 'advanced_sql'
      ? {
          query_mode: 'advanced',
          where_clause: whereClause,
        }
      : {
          query_mode: 'builder',
          relation,
          conditions: conditions.map((item) => ({
            field: item.field,
            operator: item.operator,
            value: item.value,
            value_to: item.value_to,
          })),
        }
  }

  async function previewSqlDelete() {
    setLoading('sql-preview')
    setError(null)
    setFeedback(null)
    setProcessedPosts({})
    try {
      const data = await postJson<SqlPreviewData>('/api/niceme/message-delete/sql/preview', buildSqlPayload())
      setSqlPreview(data)
      setFeedback(`已生成删除预览，共 ${data.summary.target_posts} 个 post、${data.summary.target_messages} 条消息。`)
      await refreshLogs()
    } catch (requestError) {
      setSqlPreview(null)
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

    const confirmed = window.confirm(`确认处理 post_key=${executeModal.postKey} 吗？`)
    if (!confirmed) {
      return
    }

    setLoading('single-execute')
    setError(null)
    setFeedback(null)
    try {
      const data = await postJson<SinglePostExecutionData>('/api/niceme/message-delete/sql/execute-single', {
        ...buildSqlPayload(),
        post_key: executeModal.postKey,
        execute_options: {
          delete_telegram: executeModal.deleteTelegram,
          delete_files: executeModal.deleteFiles,
          delete_db: executeModal.deleteDb,
        },
        confirm_execute: true,
      })
      setProcessedPosts((current) => ({ ...current, [data.post_key]: data }))
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
    setRangeResult(null)
    setProcessedRangeMessages({})
    try {
      const normalizedStartId = Number.parseInt(startId, 10)
      const normalizedEndId = endId.trim() ? Number.parseInt(endId, 10) : NaN
      const normalizedCount = rangeCount.trim() ? Number.parseInt(rangeCount, 10) : NaN

      if (Number.isNaN(normalizedStartId)) {
        throw new Error('开始消息 ID 必须是整数')
      }

      let resolvedEndId = normalizedEndId
      if (Number.isNaN(resolvedEndId)) {
        if (Number.isNaN(normalizedCount) || normalizedCount <= 0) {
          throw new Error('结束消息 ID 和想删除的消息数量至少填写一个')
        }
        resolvedEndId = normalizedStartId + normalizedCount - 1
        setEndId(String(resolvedEndId))
      }

      const data = await postJson<RangePreviewData>('/api/niceme/message-delete/id-range/preview', {
        start_id: normalizedStartId,
        end_id: resolvedEndId,
      })
      setRangePreview(data)
      setFeedback(`已生成 ID 区间预览，共 ${data.message_count} 条 Telegram 消息。`)
      await refreshLogs()
    } catch (requestError) {
      setRangePreview(null)
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
      setFeedback(`消息检查完成，共扫描 ${data.summary.total_posts} 个 post。`)
      await refreshLogs()
    } catch (requestError) {
      setDeliveryResult(null)
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
        actions={
          <button type="button" className="header-button" onClick={() => void refreshLogs(activeTab)}>
            刷新日志
          </button>
        }
      />

      {feedback ? <div className="info-banner">{feedback}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

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
              className={`delete-tab-button${activeTab === 'builder' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('builder')}
            >
              条件查询
            </button>
            <button
              type="button"
              className={`delete-tab-button${activeTab === 'advanced_sql' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('advanced_sql')}
            >
              SQL 查询
            </button>
            <button
              type="button"
              className={`delete-tab-button${activeTab === 'id_range' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('id_range')}
            >
              消息 ID 区间
            </button>
            <button
              type="button"
              className={`delete-tab-button${activeTab === 'delivery_check' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('delivery_check')}
            >
              消息检查
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
                    <div className="delete-summary-grid">
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">目标 Post</p>
                        <strong className="dashboard-card-value">{sqlSummary.target_posts}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">目标消息</p>
                        <strong className="dashboard-card-value">{sqlSummary.target_messages}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">查询窗口</p>
                        <strong className="delete-summary-text">最近 {sqlSummary.delete_window_hours + sqlSummary.db_utc_offset_hours} 小时</strong>
                      </article>
                    </div>

                    <div className="delete-preview-list">
                      {sqlPreview?.groups.map((group) => {
                        const processed = processedPosts[group.post_key]
                        return (
                          <article key={`${group.post_key}-${group.current_post}`} className={`delete-preview-item${processed ? ' is-processed' : ''}`}>
                            <div className="delete-preview-head">
                              <strong>
                                {group.current_post}/{group.total_post}
                              </strong>
                              <span>{group.username || '未知用户'}</span>
                            </div>
                            <p><span>IDSTR</span>{group.idstr || '-'}</p>
                            <p><span>USERID</span>{group.userid || '-'}</p>
                            <p>
                              <span>URL</span>
                              {group.url ? (
                                <a href={group.url} target="_blank" rel="noreferrer">{group.url}</a>
                              ) : '-'}
                            </p>
                            <p><span>MESSAGE_IDS</span>{group.message_ids.join(', ') || '-'}</p>
                            <div className="delete-file-list">
                              <span>FILES</span>
                              {group.file_candidates.length ? (
                                group.file_candidates.map((item, index) => (
                                  <div key={`${item.name}-${index}`} className={`delete-file-item delete-file-item-${item.status}`}>
                                    {item.status === 'found' ? item.path : item.name}
                                  </div>
                                ))
                              ) : (
                                <div className="delete-file-item">-</div>
                              )}
                            </div>
                            <div className="delete-preview-actions">
                              {processed ? (
                                <span className="delete-processed-tag">已处理</span>
                              ) : (
                                <button
                                  type="button"
                                  className="delete-danger-button"
                                  onClick={() => setExecuteModal({
                                    postKey: group.post_key,
                                    deleteTelegram: true,
                                    deleteFiles: true,
                                    deleteDb: false,
                                  })}
                                >
                                  确认删除
                                </button>
                              )}
                            </div>
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
                  <label className="delete-check delete-check-danger">
                    <input type="checkbox" checked={rangeConfirmed} onChange={(event) => setRangeConfirmed(event.target.checked)} />
                    <span>开启后点击删除按钮直接执行，不再二次确认</span>
                  </label>
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
                        <strong className="dashboard-card-value">{rangeSummary.message_count}</strong>
                      </article>
                    </div>

                    <div className="delete-range-list">
                      {rangeSummary.message_ids.map((messageId) => {
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
                {deliveryResult ? (
                  <>
                    <div className="delete-summary-grid">
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">总 Post</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.total_posts}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">完整发送</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.complete}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">错位发送</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.misordered}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">漏发送</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.missing}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">重复发送</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.duplicate_send}</strong>
                      </article>
                      <article className="dashboard-card delete-summary-card">
                        <p className="dashboard-card-title">未知</p>
                        <strong className="dashboard-card-value">{deliveryResult.summary.unknown}</strong>
                      </article>
                    </div>
                    <div className="delete-preview-list">
                      {deliveryResult.results.length ? (
                        deliveryResult.results.map((item) => (
                          <article key={item.post_key} className={`delete-preview-item delivery-status-${item.status}`}>
                            <div className="delete-preview-head">
                              <strong>{item.status_label}</strong>
                              <span>{item.username || '未知用户'}</span>
                            </div>
                            <p><span>DETAIL</span>{item.detail}</p>
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
          {Object.keys(processedPosts).length > 0 || rangeResult ? (
            <div className="delete-result-grid">
              {rangeResult
                ? Object.entries(rangeResult.summary).map(([key, value]) => (
                    <article key={key} className="dashboard-card delete-summary-card">
                      <p className="dashboard-card-title">{key}</p>
                      <strong className="dashboard-card-value">{String(value)}</strong>
                    </article>
                  ))
                : Object.entries(processedPosts).map(([postKey, result]) => (
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
        <button type="button" className="section-header theme-table">
          <span className="section-title-group">
            <span className="drag-handle">⋮⋮</span>
            <span className="section-title">删除日志</span>
          </span>
        </button>
        <div className="section-content">
          <div className="delete-log-shell">
            <div className="delete-log-toolbar">
              <span>最近日志输出</span>
              <div className="delete-log-toolbar-actions">
                <button type="button" className="reset-button" onClick={() => void clearLogs()} disabled={loading === 'logs'}>
                  {loading === 'logs' ? '处理中...' : '清理日志'}
                </button>
                <button type="button" className="header-button" onClick={() => void refreshLogs(activeTab)} disabled={loading === 'logs'}>
                  {loading === 'logs' ? '刷新中...' : '刷新'}
                </button>
              </div>
            </div>
            <pre className="delete-log-output">{logs.length ? logs.join('\n') : '暂无日志输出'}</pre>
          </div>
        </div>
      </section>
    </section>
  )
}
