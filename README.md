# Cursor Bot Dashboard

Dashboard que mide la adopción del Cursor Bot en los squads de Humand, sprint a sprint. Los datos se actualizan automáticamente cada 6 horas desde Jira.

Hosteado en GitHub Pages. Sin build step. Un archivo `index.html` que lee un `data.json` generado por un workflow.

## Setup inicial (una sola vez)

### 1. Pushear a un repo nuevo en GitHub

El repo tiene que ser **público** para que GitHub Pages funcione gratis.

```bash
git remote add origin https://github.com/TU-USUARIO/cursor-bot-dashboard.git
git push -u origin main
```

### 2. Generar un API token de Jira

1. Ir a https://id.atlassian.com/manage-profile/security/api-tokens
2. Click en "Create API token" → ponerle un nombre → copiarlo
3. En terminal, computar el token base64:

   ```bash
   echo -n "tu-email@humand.co:EL_API_TOKEN" | base64
   ```

4. Copiar el string largo que imprime.

### 3. Configurar el secret en GitHub

1. En el repo: Settings → Secrets and variables → Actions → New repository secret
2. Name: `JIRA_TOKEN`
3. Value: el string base64 del paso anterior
4. Add secret

### 4. Habilitar GitHub Pages

1. Settings → Pages
2. Source: Deploy from branch
3. Branch: `main` / folder: `/ (root)`
4. Save

### 5. Triggerear el workflow la primera vez

1. Actions → "Actualizar datos de Jira" → Run workflow → Run workflow
2. Esperar ~2 minutos. Cuando el run termine en verde, aparece `data.json` en el repo.
3. El dashboard está vivo en `https://TU-USUARIO.github.io/cursor-bot-dashboard/`

## Cómo funciona la actualización

El workflow corre cada 6 horas (y también se puede disparar manualmente). Trae los datos de Jira, genera `data.json`, y lo commitea automáticamente. GitHub Pages sirve el HTML + el JSON actualizado.

## Troubleshooting

| Problema | Solución |
|---|---|
| Dashboard muestra "Sin datos todavía" | El workflow aún no corrió. Andá a Actions y triggerealo manualmente |
| Workflow falla con `Jira 401` | El token expiró o está mal. Regenerá y actualizá el secret `JIRA_TOKEN` |
| Workflow falla con `Jira 403` | Tu usuario de Jira no tiene permisos para leer algún squad. Revisá acceso |
| Un squad aparece en gris con `--` | Ese squad no tiene board Scrum en Jira o no tuvo sprints desde 24-feb-2025 |
| No se actualizan los datos | El workflow puede haber fallado. Revisá Actions → último run |

## Squads monitoreados

`SQZB` `SQSQ` `SQSH` `SQRN` `SQRC` `SQPM` `SQPD` `SQOW` `SQOT` `SQKA` `SQJG` `SQGZ` `SQEG` `SQDP` `SQXS` `SQCY` `SQWH`

## Criterio de tasks del bot

Tickets de tipo **Subtask**, **Sub-task** o **Dev Task**, estado **Done**, asignados al usuario **Cursor Bot**, desde el sprint que arrancó el **24 de febrero de 2025**.

Adopción = `tasks del bot / total tasks del mismo tipo en el sprint × 100`.
