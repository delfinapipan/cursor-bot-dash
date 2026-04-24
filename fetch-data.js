// fetch-data.js — corre en GitHub Actions, genera data.json
// Requiere: Node 20+ y la env var JIRA_TOKEN (base64 de email:api_token)

const BASE_URL    = 'https://humand.atlassian.net';
// .trim() por si el secret se guardo con un whitespace/newline accidental
const TOKEN       = (process.env.JIRA_TOKEN || '').trim();
const BOT_ACCOUNT = '712020:98b3a270-fe83-4788-9d35-e5b5611a7a64';
const START_DATE  = '2025-02-24';
const SQUADS = [
  'SQZB', 'SQSQ', 'SQSH', 'SQRN', 'SQRC', 'SQPM', 'SQPD',
  'SQOW', 'SQOT', 'SQKA', 'SQJG', 'SQGZ', 'SQEG', 'SQDP',
  'SQCY', 'SQWH', 'SQCC'
];

if (!TOKEN) {
  console.error('ERROR: falta la env var JIRA_TOKEN');
  process.exit(1);
}

// Log de diagnostico: largo del token (sin imprimirlo)
console.log(`JIRA_TOKEN cargado: ${TOKEN.length} chars`);

// ── Helpers ───────────────────────────────────────────────────────────

async function jiraFetch(path, options = {}) {
  const { method = 'GET', body = null, retryOnce = true } = options;
  const headers = {
    'Authorization': `Basic ${TOKEN}`,
    'Accept': 'application/json'
  };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    if (retryOnce && res.status >= 500) {
      await new Promise(r => setTimeout(r, 1000));
      return jiraFetch(path, { method, body, retryOnce: false });
    }
    const errText = await res.text().catch(() => '');
    throw new Error(`Jira ${res.status} → ${path.split('?')[0]}${errText ? ` :: ${errText.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

async function getBoardId(squad) {
  // Preferimos scrum (tienen sprints). Si no hay, caemos a cualquier board
  // del proyecto — getSprints se ocupara de devolver [] si el board no tiene sprints.
  const scrum = await jiraFetch(
    `/rest/agile/1.0/board?projectKeyOrId=${squad}&type=scrum&maxResults=50`
  );
  if (scrum.values && scrum.values.length > 0) return scrum.values[0].id;

  const any = await jiraFetch(
    `/rest/agile/1.0/board?projectKeyOrId=${squad}&maxResults=50`
  );
  if (any.values && any.values.length > 0) return any.values[0].id;

  return null;
}

async function getSprints(boardId) {
  // Paginamos hasta agarrar todos los sprints del board (Jira devuelve de a 50).
  const all = [];
  let startAt = 0;
  const pageSize = 50;
  while (true) {
    const data = await jiraFetch(
      `/rest/agile/1.0/board/${boardId}/sprint?state=closed,active&startAt=${startAt}&maxResults=${pageSize}`
    );
    const values = data.values || [];
    all.push(...values);
    if (data.isLast || values.length < pageSize) break;
    startAt += pageSize;
    if (startAt > 1000) break; // safety: no board deberia tener >1000 sprints
  }
  const cutoff = new Date(START_DATE);
  return all
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
  // API vieja (/rest/api/3/search) fue deprecada — usar approximate-count.
  const data = await jiraFetch(
    `/rest/api/3/search/approximate-count`,
    { method: 'POST', body: { jql } }
  );
  return data.count || 0;
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
