import { Manifest, RadarData } from './types';

const GITHUB_API = 'https://api.github.com';

function getConfig() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.XRADAR_REPO_OWNER || 'justinbao19',
    repo: process.env.XRADAR_REPO_NAME || 'X-radar',
    dataPath: process.env.XRADAR_DATA_PATH || 'web/public/data',
  };
}

function headers(): HeadersInit {
  const { token } = getConfig();
  const h: HeadersInit = {
    Accept: 'application/vnd.github.v3.raw',
    'User-Agent': 'X-Swipe-Sync',
  };
  if (token) {
    h['Authorization'] = `Bearer ${token}`;
  }
  return h;
}

export async function fetchManifest(): Promise<Manifest | null> {
  const { owner, repo, dataPath } = getConfig();
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${dataPath}/manifest.json`;

  const res = await fetch(url, { headers: headers(), next: { revalidate: 0 } });
  if (!res.ok) {
    console.error(`Failed to fetch manifest: ${res.status} ${res.statusText}`);
    return null;
  }

  return res.json() as Promise<Manifest>;
}

export async function fetchDataFile(filename: string): Promise<RadarData | null> {
  const { owner, repo, dataPath } = getConfig();
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${dataPath}/${filename}`;

  const res = await fetch(url, { headers: headers(), next: { revalidate: 0 } });
  if (!res.ok) {
    console.error(`Failed to fetch data file ${filename}: ${res.status} ${res.statusText}`);
    return null;
  }

  return res.json() as Promise<RadarData>;
}
