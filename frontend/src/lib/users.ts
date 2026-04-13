export type UserRecord = Record<string, string | number | null>

export type UserListResponse = {
  status: 'success' | 'error'
  msg?: string
  data: UserRecord[]
}

export type UserUpdateResponse = {
  status: 'success' | 'error'
  msg?: string
}

export type UserLogsResponse = {
  status: 'success' | 'error'
  msg?: string
  data: {
    lines: string[]
  }
}
