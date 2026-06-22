import changelogRaw from '../../CHANGELOG.md?raw';

/**
 * Парсит CHANGELOG.md: секции ## X.Y.Z с пунктами "- ..."
 */
export function parseChangelog(markdown) {
  const sections = [];
  const parts = markdown.split(/^##\s+/m).filter(Boolean);

  for (const part of parts) {
    const lines = part.trim().split('\n');
    const header = lines[0]?.trim() || '';
    const versionMatch = header.match(/^([\d.]+)/);
    if (!versionMatch) continue;

    const version = versionMatch[1];
    const dateMatch = header.match(/\(([^)]+)\)/);
    const date = dateMatch ? dateMatch[1].trim() : null;
    const items = lines
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-'))
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);

    sections.push({ version, date, items });
  }

  return sections;
}

const cachedSections = parseChangelog(changelogRaw);

export function getAllChangelogSections() {
  return cachedSections;
}

export function getChangelogForVersion(version) {
  if (!version) return cachedSections[0] || null;
  const exact = cachedSections.find((s) => s.version === version);
  if (exact) return exact;
  return cachedSections[0] || null;
}
