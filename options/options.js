/**
 * options.js – Settings page logic
 * ─────────────────────────────────
 * Loads existing config from storage on page load, and saves back on submit.
 * Also offers a "Test Connection" button to validate the PAT.
 */

import { loadConfig, saveConfig } from '../services/configService.js';
import { getMyIdentity, getTeamId } from '../services/azureDevopsClient.js';
import { STORAGE_KEY } from '../core/constants.js';

/* ── DOM refs ── */
const form = document.getElementById('settings-form');
const msgEl = document.getElementById('message');
const btnTest = document.getElementById('btn-test');
const btnToggle = document.getElementById('btn-toggle-pat');
const patInput = document.getElementById('pat');
const teamVoteAsApprovalInput = document.getElementById('treatTeamVoteAsApproval');

/* ── Helpers ── */
function showMsg(text, type = 'success') {
  msgEl.textContent = text;
  msgEl.className = type; // success | error
}
function hideMsg() {
  msgEl.className = 'hidden';
}

/* ── Load existing settings into the form ── */
async function populateForm() {
  const cfg = await loadConfig();
  document.getElementById('organization').value = cfg.organization;
  document.getElementById('project').value = cfg.project;
  document.getElementById('team').value = cfg.team;
  patInput.value = cfg.pat;
  document.getElementById('autoRefresh').checked = cfg.autoRefresh;
  document.getElementById('refreshInterval').value = cfg.refreshInterval;
  document.getElementById('treatTeamVoteAsApproval').checked = cfg.treatTeamVoteAsApproval;
  document.getElementById('sprintTeam').value = cfg.sprintTeam;
}

/* ── Save ── */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg();

  const config = {
    organization: document.getElementById('organization').value.trim(),
    project: document.getElementById('project').value.trim(),
    team: document.getElementById('team').value.trim(),
    pat: patInput.value.trim(),
    autoRefresh: document.getElementById('autoRefresh').checked,
    refreshInterval: Number(document.getElementById('refreshInterval').value) || 5,
    treatTeamVoteAsApproval: document.getElementById('treatTeamVoteAsApproval').checked,
    sprintTeam: document.getElementById('sprintTeam').value.trim(),
  };

  // Validate required fields
  if (!config.organization || !config.project || !config.team || !config.pat) {
    showMsg('All fields marked with * are required.', 'error');
    return;
  }

  try {
    await saveConfig(config);
    showMsg('Settings saved successfully.', 'success');
  } catch (err) {
    showMsg('Failed to save: ' + err.message, 'error');
  }
});

/* ── Test connection ── */
btnTest.addEventListener('click', async () => {
  hideMsg();
  const org = document.getElementById('organization').value.trim();
  const pat = patInput.value.trim();
  const project = document.getElementById('project').value.trim();
  const team = document.getElementById('team').value.trim();

  if (!org || !pat) {
    showMsg('Organization and PAT are required to test.', 'error');
    return;
  }

  if (!project || !team) {
    showMsg('Project and Team are required for full validation.', 'error');
    return;
  }

  btnTest.disabled = true;
  btnTest.textContent = 'Testing…';

  try {
    const me = await getMyIdentity(org, pat);
    // Also validate that the team exists
    const teamId = await getTeamId(org, project, team, pat);
    showMsg(`Connection OK – authenticated as "${me.displayName}". Team "${team}" found (ID: ${teamId})`, 'success');
  } catch (err) {
    showMsg('Connection failed: ' + err.message, 'error');
  } finally {
    btnTest.disabled = false;
    btnTest.textContent = 'Test Connection';
  }
});

/* ── Toggle PAT visibility ── */
btnToggle.addEventListener('click', () => {
  patInput.type = patInput.type === 'password' ? 'text' : 'password';
});

/* ── Save team-vote policy immediately on toggle ── */
teamVoteAsApprovalInput.addEventListener('change', async () => {
  hideMsg();
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY.TREAT_TEAM_VOTE]: teamVoteAsApprovalInput.checked,
    });
    showMsg('Review policy updated.', 'success');
  } catch (err) {
    showMsg('Failed to update review policy: ' + err.message, 'error');
  }
});

/* ── Init ── */
populateForm();
