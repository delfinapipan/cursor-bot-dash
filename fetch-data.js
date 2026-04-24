// fetch-data.js — corre en GitHub Actions, genera data.json
// Requiere: Node 20+ y la env var JIRA_TOKEN (base64 de email:api_token)

const BASE_URL    = 'https://humand.atlassian.net';
const TOKEN       = process.env.JIRA_TOKEN;
const BOT_ACCOUNT = '712020:98b3a270-fe83-4788-9d35-e5b5611a7a64';
const START_DATE  = '2025-02-24';
const SQUADS = [
  'SQZB', 'SQSQ', 'SQSH', 'SQRN', 'SQRC', 'SQPM', 'SQPD',
  'SQOW', 'SQOT', 'SQKA', 'SQJG', 'SQGZ', 'SQEG', 'SQDP',
  'SQXS', 'SQCY', 'SQWH'
];

if (!TOKEN) {
  console.error('ERROR: falta la env var JIRA_TOKEN');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────

async function jiraFetch(path, retryOnce = true) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Authorization': `Basic ${TOKEN}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    if (retryOnce && res.status >= 500) {
      await new Promise(r => setTimeout(r, 1000));
      return jiraFetch(path, false);
    }
    const body = await res.text().catch(() => '');
    throw new Error(`Jira ${res.status} → ${path.split('?')[0]}${body ? ` :: ${body.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

async function getBoardId(squad) {
  const data = await jiraFetch(
    `/rest/agile/1.0/board?projectKeyOrId=${squad}&type=scrum&maxResults=1`
  );
  if (!data.values || data.values.length === 0) return null;
  return data.values[0].id;
}

async function getSprints(boardId) {
  const data = await jiraFetch(
    `/rest/agile/1.0/board/${boardId}/sprint?state=closed,active&maxResults=100`
  );
  const cutoff = new Date(START_DATE);
  return (data.values || [])
    .filter(s => s.startDate && new Date(s.startDate) >= cutoff)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .map(s => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate || null
    }));
}

async function getIssueCount(squad, sprintId, botOnly) {
  const assigneeClause = botOnly ? ` AND assignee = "${BOT_ACCOUNT}"` : '';
  const jql = `project = "${squad}" AND issuetype in (Subtask, "Sub-task", "Dev Task") AND status = Done AND sprint = ${sprintId}${assigneeClause}`;
  const data = await jiraFetch(
    `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=0&fields=id`
  );
  return data.total || 0;
}

async function loadSquad(squad) {
  try {
    const boardId = await getBoardId(squad);
    if (!boardId) return { sprints: [], error: 'Sin board Scrum' };

    const sprints = await getSprints(boardId);
    if (sprints.length === 0) return { sprints: [], error: 'Sin sprints recientes' };

    const sprintData = [];
    for (const s of sprints) {
      const [botCount, totalCount] = await Promise.all([
        getIssueCount(squad, s.id, true),
        getIssueCount(squad, s.id, false)
      ]);
      sprintData.push({ ...s, botCount, totalCount });
    }

    return { sprints: sprintData, error: null };
  } catch (err) {
    return { sprints: [], error: err.message };
  }
}

// ── Main ──────────────────────────────────────────────────────────────

(async () => {
  console.log(`Fetching data for ${SQUADS.length} squads...`);

  const squadResults = {};
  for (const squad of SQUADS) {
    const result = await loadSquad(squad);
    const botTotal = result.sprints.reduce((sum, s) => sum + s.botCount, 0);
    const suffix = result.error ? ` (${result.error})` : ` → ${result.sprints.length} sprints, ${botTotal} bot tasks`;
    console.log(`  ${result.error ? '⚠' : '✓'} ${squad}${suffix}`);
    squadResults[squad] = result;
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    squads: squadResults
  };

  const fs = await import('fs');
  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log(`\n✅ data.json escrito (${fs.statSync('data.json').size} bytes)`);
})();
