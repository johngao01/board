import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { apiGet } from '../lib/api'
import type { UserListResponse, UserRecord, UserUpdateResponse } from '../lib/users'

function toDisplayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  return String(value)
}

export function UserManagePage() {
  const [rows, setRows] = useState<UserRecord[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let cancelled = false

    async function loadUsers() {
      setLoading(true)
      setFeedback(null)

      try {
        const response = await apiGet<UserListResponse>('/api/niceme/users')
        if (cancelled) {
          return
        }

        const data = response.data ?? []
        setRows(data)

        if (data.length > 0) {
          const firstId = String(data[0].USERID ?? '')
          setSelectedId(firstId)
          setDraft(
            Object.fromEntries(
              Object.entries(data[0]).map(([key, value]) => [key, value == null ? '' : String(value)]),
            ),
          )
        }
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

  const filteredRows = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    if (!keyword) {
      return rows
    }

    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(keyword)),
    )
  }, [deferredQuery, rows])

  const selectedRow = useMemo(
    () => rows.find((row) => String(row.USERID ?? '') === selectedId) ?? null,
    [rows, selectedId],
  )

  useEffect(() => {
    if (!selectedRow) {
      return
    }

    setDraft(
      Object.fromEntries(
        Object.entries(selectedRow).map(([key, value]) => [key, value == null ? '' : String(value)]),
      ),
    )
  }, [selectedRow])

  const editableFields = useMemo(() => {
    if (!selectedRow) {
      return []
    }

    return Object.keys(selectedRow).filter((key) => key !== 'USERID')
  }, [selectedRow])

  async function saveUser() {
    if (!selectedRow) {
      return
    }

    const changedEntries = editableFields.filter((field) => {
      const original = selectedRow[field]
      const next = draft[field] ?? ''
      return String(original ?? '') !== next
    })

    if (changedEntries.length === 0) {
      setFeedback('当前没有改动')
      return
    }

    const payload = Object.fromEntries(changedEntries.map((field) => [field, draft[field] ?? '']))

    setSaving(true)
    setFeedback(null)

    try {
      const response = await fetch(`/api/niceme/users/${selectedId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const result = (await response.json()) as UserUpdateResponse

      if (!response.ok || result.status !== 'success') {
        throw new Error(result.msg || '保存失败')
      }

      setRows((currentRows) =>
        currentRows.map((row) =>
          String(row.USERID ?? '') === selectedId
            ? {
                ...row,
                ...payload,
              }
            : row,
        ),
      )

      setFeedback('保存成功')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page">
      <div className="page-hero">
        <div className="hero-row">
          <div>
            <p className="section-kicker">User Management</p>
            <h3>User 管理已经迁成 React 工作台</h3>
            <p className="section-copy">
              这一版先用可维护的原生表格 + 侧边编辑面板替掉旧模板和 ag-grid，后面如果有更重的筛选或批量编辑需求，再决定是否换回专业表格组件。
            </p>
          </div>

          <label className="date-field">
            <span>快速搜索</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜 USERID / USERNAME / 备注"
            />
          </label>
        </div>
      </div>

      {feedback ? <div className="info-banner">{feedback}</div> : null}

      <div className="user-layout">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Users</p>
              <h4>用户列表</h4>
            </div>
            <div className="panel-note">{loading ? '加载中...' : `${filteredRows.length} 条`}</div>
          </div>

          <div className="user-grid">
            <div className="user-grid-row user-grid-head">
              <span>USERID</span>
              <span>USERNAME</span>
              <span>valid</span>
              <span>来源字段预览</span>
            </div>
            {filteredRows.slice(0, 200).map((row) => {
              const rowId = String(row.USERID ?? '')
              const active = rowId === selectedId
              return (
                <button
                  type="button"
                  key={rowId}
                  className={active ? 'user-grid-row is-selected' : 'user-grid-row'}
                  onClick={() => setSelectedId(rowId)}
                >
                  <span>{toDisplayValue(row.USERID)}</span>
                  <span>{toDisplayValue(row.USERNAME)}</span>
                  <span>{toDisplayValue(row.valid)}</span>
                  <span>{toDisplayValue(row.SOURCED ?? row.sourced ?? row.platform ?? row.remark)}</span>
                </button>
              )
            })}
            {!loading && filteredRows.length === 0 ? (
              <div className="empty-state table-empty">没有匹配到用户</div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Editor</p>
              <h4>字段编辑</h4>
            </div>
            <button type="button" className="ghost-button" onClick={saveUser} disabled={saving || !selectedRow}>
              {saving ? '保存中...' : '保存改动'}
            </button>
          </div>

          {selectedRow ? (
            <div className="editor-grid">
              <div className="editor-field readonly">
                <label>USERID</label>
                <div>{toDisplayValue(selectedRow.USERID)}</div>
              </div>

              {editableFields.map((field) => (
                <label key={field} className="editor-field">
                  <span>{field}</span>
                  <input
                    value={draft[field] ?? ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="empty-state">请选择左侧用户后再编辑</div>
          )}
        </section>
      </div>
    </section>
  )
}
