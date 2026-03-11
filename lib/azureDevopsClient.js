/**
 * azureDevopsClient.js
 * ────────────────────
 * Thin wrapper around Azure DevOps REST API (v7.1-preview).
 *
 * AUTHENTICATION
 *   Uses Basic Auth with an empty username and the PAT as password.
 *   Header:  Authorization: Basic base64(":" + pat)
 *
 * TEAM FILTERING
 *   Pull requests are filtered to show only those where the specified team
 *   is set as a required or optional reviewer.
 *
 * HOW TO EXTEND
 *   • To filter by repository: add `searchCriteria.repositoryId` to the
 *     pull-requests query string.
 *   • To filter by author: add `searchCriteria.creatorId`.
 *   • See https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-requests
 */

/**
 * Build the Basic-Auth header value for a PAT.
 * @param {string} pat
 * @returns {string}
 */
function authHeader(pat) {
  return 'Basic ' + btoa(':' + pat);
}

/**
 * Get team ID by team name.
 * Lists all teams in the project and finds the one matching the given name.
 *
 * @param {string} organization
 * @param {string} project
 * @param {string} teamName
 * @param {string} pat
 * @returns {Promise<string>}  The team's ID (GUID)
 */
export async function getTeamId(organization, project, teamName, pat) {
  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}/teams?api-version=7.1`;
  const resp = await fetch(url, {
    headers: { Authorization: authHeader(pat) },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch teams (${resp.status} ${resp.statusText})`);
  }

  const data = await resp.json();
  const teams = data.value || [];
  
  // Try to find team by exact name match (case-insensitive)
  const team = teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
  
  if (!team) {
    throw new Error(`Team "${teamName}" not found in project "${project}". Available teams: ${teams.map(t => t.name).join(', ')}`);
  }
  
  return team.id;
}

/**
 * Resolve the current user's identity (the person who owns the PAT).
 * We hit the "me" profile endpoint:
 *   GET https://vssps.dev.azure.com/{org}/_apis/profile/profiles/me?api-version=7.1-preview.1
 *
 * Falls back to the connectionData endpoint if profile doesn't give us what we need.
 *
 * @param {string} organization
 * @param {string} pat
 * @returns {Promise<{id:string, displayName:string, uniqueName:string}>}
 */
export async function getMyIdentity(organization, pat) {
  // Primary: connection data gives us authenticatedUser reliably
  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/connectionData`;
  const resp = await fetch(url, {
    headers: { Authorization: authHeader(pat) },
  });

  if (!resp.ok) {
    throw new Error(`Failed to resolve identity (${resp.status} ${resp.statusText})`);
  }

  const data = await resp.json();
  const user = data.authenticatedUser;
  return {
    id: user.id,                       // GUID
    displayName: user.providerDisplayName || user.customDisplayName || '',
    uniqueName: user.properties?.Account?.$value || '',
  };
}

/**
 * Fetch all active pull requests for a project where the specified team is a reviewer.
 * Filters PRs to show only those where the team is set as required or optional reviewer.
 *
 * Endpoint:
 *   GET https://dev.azure.com/{org}/{project}/_apis/git/pullrequests
 *       ?searchCriteria.status=active
 *       &$top=200
 *       &api-version=7.1-preview.1
 *
 * @param {{organization:string, project:string, team:string, pat:string}} config
 * @returns {Promise<Array>}  array of PR objects from the API filtered by team
 */
export async function fetchActivePullRequests(config) {
  const { organization, project, team, pat } = config;

  // First, resolve the team name to its ID
  const teamId = await getTeamId(organization, project, team, pat);
  console.log(`[REBUSS] Resolved team "${team}" to ID: ${teamId}`);

  const baseUrl =
    `https://dev.azure.com/${encodeURIComponent(organization)}` +
    `/${encodeURIComponent(project)}` +
    `/_apis/git/pullrequests`;

  // Fetch active PRs (change to 'all' temporarily for debugging if needed)
  const params = new URLSearchParams({
    'searchCriteria.status': 'active',
    '$top': '200',
    'api-version': '7.1-preview.1',
  });

  const resp = await fetch(`${baseUrl}?${params}`, {
    headers: { Authorization: authHeader(pat) },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Azure DevOps API error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const allPrs = data.value || [];

  // Filter PRs where the team is a reviewer (required or optional)
  const filteredPrs = allPrs.filter(pr => {
    const reviewers = pr.reviewers || [];
    return reviewers.some(reviewer => {
      // Check if this reviewer is the team we're looking for
      // Teams in reviewers list have an 'id' field that matches the team ID
      return reviewer.id && reviewer.id.toLowerCase() === teamId.toLowerCase();
    });
  });

  console.log(`[REBUSS] Found ${filteredPrs.length} PRs (out of ${allPrs.length} total) where team "${team}" is a reviewer`);
  
  // DEBUGGING: Log detailed info about each PR's reviewers
  filteredPrs.forEach(pr => {
    console.log(`\n[REBUSS DEBUG] ===== PR ${pr.pullRequestId} (${pr.status}) =====`);
    console.log(`[REBUSS DEBUG] Title: ${pr.title}`);
    console.log(`[REBUSS DEBUG] Total reviewers: ${pr.reviewers?.length}`);
    pr.reviewers?.forEach((reviewer, idx) => {
      console.log(`[REBUSS DEBUG] Reviewer #${idx}:`, {
        id: reviewer.id,
        displayName: reviewer.displayName,
        uniqueName: reviewer.uniqueName,
        vote: reviewer.vote,
        isRequired: reviewer.isRequired,
        isFlagged: reviewer.isFlagged,
        hasDeclined: reviewer.hasDeclined
      });
    });
    // Store teamId in PR for later use
    pr._teamId = teamId;
  });
  
  return filteredPrs;
}

/**
 * Classify a single PR from the perspective of the current user.
 *
 * Azure DevOps reviewer vote values:
 *   10  = approved
 *    5  = approved with suggestions
 *    0  = no vote
 *   -5  = waiting for author
 *  -10  = rejected
 *
 * @param {object} pr         – PR object from the API
 * @param {string} myUserId   – GUID of the current user
 * @param {string} teamId     – GUID of the team (optional)
 * @param {boolean} treatTeamVoteAsApproval – when true, team vote can be treated as personal approval
 * @returns {{ isReviewer:boolean, hasApproved:boolean, needsMyReview:boolean, vote:number, isWaitingForAuthor:boolean, isMuted:boolean }}
 */
export function classifyApproval(pr, myUserId, teamId = null, treatTeamVoteAsApproval = false) {
  const lowerMyId = myUserId.toLowerCase();
  const lowerTeamId = teamId?.toLowerCase();

  console.log(`\n[REBUSS DEBUG] ===== Classifying PR ${pr.pullRequestId} =====`);
  console.log(`[REBUSS DEBUG] My User ID: ${lowerMyId}`);
  console.log(`[REBUSS DEBUG] Team ID: ${lowerTeamId}`);
  console.log(`[REBUSS DEBUG] Reviewers count: ${pr.reviewers?.length}`);
  
  // Log each reviewer comparison
  pr.reviewers?.forEach((r, idx) => {
    const matchesMe = r.id?.toLowerCase() === lowerMyId;
    const matchesTeam = lowerTeamId && r.id?.toLowerCase() === lowerTeamId;
    console.log(`[REBUSS DEBUG] Reviewer #${idx}: ${r.displayName || 'Unknown'}`);
    console.log(`[REBUSS DEBUG]   ID: ${r.id}`);
    console.log(`[REBUSS DEBUG]   Matches me? ${matchesMe}`);
    console.log(`[REBUSS DEBUG]   Matches team? ${matchesTeam}`);
    console.log(`[REBUSS DEBUG]   Vote: ${r.vote}`);
  });

  // First, try to find myself as an individual reviewer
  let reviewer = (pr.reviewers || []).find(
    (r) => r.id?.toLowerCase() === lowerMyId
  );
  
  let isTeamMember = false;
  
  // If I'm not an individual reviewer, check if my team is a reviewer
  if (!reviewer && lowerTeamId) {
    const teamReviewer = (pr.reviewers || []).find(
      (r) => r.id?.toLowerCase() === lowerTeamId
    );
    
    if (teamReviewer) {
      console.log(`[REBUSS DEBUG] I'm not an individual reviewer, but my team IS a reviewer`);
      console.log(`[REBUSS DEBUG] Team vote: ${teamReviewer.vote}`);
      // Keep team reviewer info, but do NOT treat team vote as my personal vote.
      // Team vote can come from another teammate and would otherwise incorrectly
      // move PRs to "approved" even when I have not voted yet.
      reviewer = teamReviewer;
      isTeamMember = true;
    }
  }

  if (!reviewer) {
    console.log(`[REBUSS DEBUG] Result: I am NOT a reviewer (neither individually nor through team)`);
    return { 
      isReviewer: false, 
      hasApproved: false, 
      needsMyReview: false,
      vote: 0,
      isWaitingForAuthor: false,
      isMuted: false
    };
  }
  
  if (isTeamMember) {
    console.log(`[REBUSS DEBUG] Result: I AM a reviewer through TEAM membership! Team vote: ${reviewer.vote}`);
  } else {
    console.log(`[REBUSS DEBUG] Result: I AM an individual reviewer! My vote: ${reviewer.vote}`);
  }

  // Team reviewer handling is configurable:
  // - false: team vote does NOT count as my personal approval (effective vote = 0)
  // - true:  team vote is used as effective vote
  const vote = (isTeamMember && !treatTeamVoteAsApproval) ? 0 : (reviewer.vote ?? 0);

  if (isTeamMember && !treatTeamVoteAsApproval) {
    console.log('[REBUSS DEBUG] Team reviewer mode: forcing effective vote to 0 (needs my approval until I vote individually)');
  }
  if (isTeamMember && treatTeamVoteAsApproval) {
    console.log('[REBUSS DEBUG] Team reviewer mode: team vote is treated as personal approval by settings');
  }
  // Approved if vote is 5 (approved with suggestions) or 10 (approved)
  const hasApproved = vote >= 5;
  
  // Waiting for author if vote is -5
  const isWaitingForAuthor = vote === -5;
  
  // Needs my review if I'm a reviewer and haven't approved (vote < 5)
  // This includes: no vote (0), waiting for author (-5), rejected (-10)
  const needsMyReview = vote < 5;
  
  // Check if PR has new changes since the vote was cast
  // If waiting for author AND no new changes, mark as muted (grayed out)
  let isMuted = false;
  if (isWaitingForAuthor) {
    // Check if there have been updates to the PR since the review
    // We use votedFor array if available, or fall back to simple heuristic
    const hasNewChanges = checkForNewChanges(pr, reviewer);
    isMuted = !hasNewChanges; // Muted if NO new changes
  }

  const result = { 
    isReviewer: true, 
    hasApproved, 
    needsMyReview,
    vote,
    isWaitingForAuthor,
    isMuted
  };
  
  console.log(`[REBUSS DEBUG] PR ${pr.pullRequestId} classification result:`, result);
  return result;
}

/**
 * Check if PR has new changes since the reviewer's vote.
 * Uses PR's lastMergeSourceCommit or creationDate to determine if there were updates.
 * 
 * HEURISTIC APPROACH:
 * - If reviewer has votedFor array with dates, compare against PR's last update
 * - Otherwise, if PR was updated in last 24h and vote is "waiting for author", assume new changes
 * - If none of above, assume NO new changes (safer to show as muted)
 * 
 * @param {object} pr - PR object from API
 * @param {object} reviewer - Reviewer object
 * @returns {boolean} true if there are new changes since vote
 */
function checkForNewChanges(pr, reviewer) {
  // Strategy 1: Check if PR has lastMergeSourceCommit with a date we can compare
  // Azure DevOps PR object has lastMergeSourceCommit.commitId but not always timestamp
  
  // Strategy 2: Use votedFor array if present (contains votes with timestamps)
  if (reviewer.votedFor && reviewer.votedFor.length > 0) {
    // votedFor is array of vote objects, get the most recent one
    const latestVote = reviewer.votedFor[reviewer.votedFor.length - 1];
    if (latestVote.reviewerUrl) {
      // Compare with PR's lastMergeSourceCommit or creationDate
      // This is complex without full API data, so we use a simpler heuristic
    }
  }
  
  // Strategy 3: Simple time-based heuristic
  // If PR was created/updated recently (within last 48 hours) and I said "waiting for author",
  // assume there might be new changes worth checking
  try {
    const prCreationDate = new Date(pr.creationDate);
    const now = new Date();
    const hoursSinceCreation = (now - prCreationDate) / (1000 * 60 * 60);
    
    // If PR is very recent (< 48 hours), assume new changes possible
    if (hoursSinceCreation < 48) {
      return true;
    }
    
    // Otherwise, assume no new changes (will be shown as muted)
    return false;
  } catch (err) {
    // If we can't parse dates, assume no new changes (safer to mute)
    return false;
  }
}

/**
 * Build a human-readable label from the numeric vote.
 * @param {number} vote
 * @returns {string}
 */
export function voteLabel(vote) {
  switch (vote) {
    case 10: return 'Approved';
    case 5:  return 'Approved with suggestions';
    case 0:  return 'No vote';
    case -5: return 'Waiting for author';
    case -10: return 'Rejected';
    default: return `Vote ${vote}`;
  }
}
