export type MainPageInfoKey = 'dashboard' | 'tiktok' | 'users' | 'juhe'

export type PageInfoConfig = {
  path: string
  navLabel: string
  navShort: string
  navHint: string
  navVisible: boolean
  navOrder: number
  navEnd?: boolean
  eyebrow: string
  title: string
  description: string
}

export const mainPageInfo: Record<MainPageInfoKey, PageInfoConfig> = {
  dashboard: {
    path: '/',
    navLabel: '今日概览',
    navShort: 'M',
    navHint: '数据总览',
    navVisible: true,
    navOrder: 1,
    navEnd: true,
    eyebrow: 'TODAY OVERVIEW',
    title: '今日概览',
    description: '汇总 NiceBot Messages表核心指标、数据图表与消息明细。',
  },
  users: {
    path: '/users',
    navLabel: '关注管理',
    navShort: 'U',
    navHint: '关注表编辑',
    navVisible: true,
    navOrder: 2,
    eyebrow: 'FOLLOWED USER DASHBOARD',
    title: '关注用户看板和管理',
    description: '集中查看关注用户核心指标、图表报告与详细信息。',
  },
  juhe: {
    path: '/juhe',
    navLabel: 'Juhe',
    navShort: 'J',
    navHint: '聚合看板',
    navVisible: true,
    navOrder: 3,
    eyebrow: 'JUHE AGGREGATION DASHBOARD',
    title: 'Juhe 聚合数据',
    description: '统一查看聚合资源质量、来源分布和上海专项趋势。',
  },
  tiktok: {
    path: '/tiktok',
    navLabel: 'TikTok',
    navShort: 'T',
    navHint: 'TikTok 统计',
    navVisible: true,
    navOrder: 99,
    eyebrow: 'TIKTOK BOT DASHBOARD',
    title: 'TikTok Bot 统计信息',
    description: 'TikTok 指标已从首页拆分，单独放在这个页面展示。',
  },
}

export const sidebarNavItems = Object.values(mainPageInfo)
  .filter((item) => item.navVisible)
  .sort((left, right) => left.navOrder - right.navOrder)
  .map((item) => ({
    to: item.path,
    label: item.navLabel,
    short: item.navShort,
    hint: item.navHint,
    end: item.navEnd,
  }))

export function getDocumentTitle(pathname: string) {
  const mainPage = Object.values(mainPageInfo).find((item) => item.path === pathname)
  if (mainPage) {
    return mainPage.title
  }

  if (pathname.startsWith('/user/')) {
    const identity = decodeURIComponent(pathname.slice('/user/'.length)).trim()
    return identity ? `${identity} 的用户报告` : '用户报告'
  }

  return 'DataCenter Board'
}
