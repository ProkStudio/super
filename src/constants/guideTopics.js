/** Maps active app page → guide topic id in i18n (`guide.topics.*`). */
export function getGuideTopicId(activePage, activeModule = 'youtube') {
  if (activeModule === 'tiktok') {
    const tiktokMap = {
      profiles: 'profiles',
      accounts: 'tiktokAccounts',
      automation: 'tiktokAutomation',
      results: 'tiktokResults',
      settings: 'settings',
      cabinet: 'cabinet',
    };
    return tiktokMap[activePage] || 'tiktokAutomation';
  }

  const map = {
    profiles: 'profiles',
    accounts: 'accounts',
    automation: 'automation',
    tasks: 'tasks',
    jokes: 'jokes',
    uniqueizer: 'uniqueizer',
    results: 'results',
    analytics: 'analytics',
    settings: 'settings',
    cabinet: 'cabinet',
    guide: 'settings',
  };
  return map[activePage] || 'settings';
}
