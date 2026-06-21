import { useState, useEffect } from 'react';
import { BarChart3, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageHeader from '../../layout/PageHeader';

export default function TikTokResults() {
  const { t } = useTranslation();
  const [stats, setStats] = useState([]);

  useEffect(() => {
    window.nexusAPI?.getTiktokCommentStats?.().then((rows) => {
      setStats(Array.isArray(rows) ? rows : []);
    });
  }, []);

  return (
    <div className="h-full flex flex-col gap-6 overflow-y-auto custom-scrollbar">
      <PageHeader
        icon={BarChart3}
        title={t('tiktok.results.title')}
        description={t('tiktok.results.subtitle')}
      />

      {stats.length === 0 ? (
        <div className="nexus-card p-8 text-center text-nexus-dim">
          <p className="text-sm">{t('tiktok.results.empty')}</p>
        </div>
      ) : (
        <div className="nexus-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-nexus-dim" style={{ borderColor: 'var(--nexus-border)' }}>
                <th className="px-4 py-3 font-medium">{t('tiktok.results.colVideo')}</th>
                <th className="px-4 py-3 font-medium w-36">{t('tiktok.results.colComments')}</th>
                <th className="px-4 py-3 font-medium w-44">{t('tiktok.results.colLastRun')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.videoUrl || row.videoId} className="border-b hover:bg-white/[0.02]" style={{ borderColor: 'var(--nexus-border)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <a
                        href={row.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:underline"
                        style={{ color: 'var(--nexus-accent)' }}
                      >
                        {row.videoUrl || row.videoId}
                      </a>
                      {row.videoUrl && <ExternalLink className="w-3.5 h-3.5 shrink-0 text-nexus-dim" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono">{row.commentsPosted ?? 0}</td>
                  <td className="px-4 py-3 text-nexus-dim text-xs">
                    {row.lastRunAt ? new Date(row.lastRunAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
