export type MainPageInfoKey = 'dashboard' | 'tiktok' | 'users' | 'juhe'

export type PageInfoConfig = {
  eyebrow: string
  title: string
  description: string
}

export const mainPageInfo: Record<MainPageInfoKey, PageInfoConfig> = {
  dashboard: {
    eyebrow: 'TODAY OVERVIEW',
    title: '今日概览',
    description: '汇总 NiceBot 核心指标、数据图表与消息明细。',
  },
  tiktok: {
    eyebrow: 'TIKTOK BOT DASHBOARD',
    title: 'TikTok Bot 统计信息',
    description: 'TikTok 指标已从首页拆分，单独放在这个页面展示。',
  },
  users: {
    eyebrow: 'FOLLOWED USER DASHBOARD',
    title: '关注用户看板和管理',
    description: '集中查看关注用户核心指标、图表报告与详细信息。',
  },
  juhe: {
    eyebrow: 'JUHE AGGREGATION DASHBOARD',
    title: 'Juhe 聚合数据',
    description: '统一查看聚合资源质量、来源分布和上海专项趋势。',
  },
}
