const { createServer } = require("http");
const axios = require('axios');

const { App } = require('@slack/bolt');
const { Webhooks, createNodeMiddleware } = require("@octokit/webhooks");
const { Octokit } = require("@octokit/rest");

const { addRepo, getRepo } = require('./store');

const {
  PORT,
  SLACK_SIGNING_SECRET,
  SLACK_BOT_TOKEN,
  SLACK_APP_TOKEN,
  GITHUB_WEBHOOK_SECRET,
  GITHUB_API_SECRET,
  JIRA_ORG_ID,
  JIRA_API_KEY,
  GITHUB_USER_NAME,
  GITHUB_GLITCH_CALLBACK_URL,
  JIRA_USER_EMAIL,
  JIRA_BASE_URL,
} = process.env

/////// SETUP ///////

// Start Slack app
let app_info; // will store info about this bot
const slack_app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: SLACK_APP_TOKEN,
  port: PORT || 3000
});
(async () => {
  await slack_app.start(PORT || 3000);
  console.log('⚡️ Bolt app is running!');

  app_info = await slack_app.client.auth.test()
})();

// Create Github REST client
const octokit = new Octokit({
  auth: GITHUB_API_SECRET
});

// Start listener for github events
const webhooks = new Webhooks({
  secret: GITHUB_WEBHOOK_SECRET,
});
createServer(createNodeMiddleware(webhooks)).listen(3000)
console.log('⚡️ Github app is running!')


////// SLACK //////

/**
* Command to setup all integrations
*/
slack_app.command("/buffet", async ({command, ack, say, respond }) => {
  await ack();

  const [action, ...values] = command.text.split(' ')

  if (action === 'setup' && values.length === 4) {
    const [owner, repo, workflow, jira_project] = values

    try {
      const resp = await createWebhook(owner, repo)
      await say(`Buffet is now listening to releases on this repository: ${resp.url}`)
    } catch (e) {
      await respond(`An issue occured while creating a webhook for this repository: ${e.request.url}`)
    }

    // Save repo settings for later
    addRepo({
      name: repo,
      owner,
      workflow,
      jira_project
    })
  } else if (action === 'demo') {
      await say(`:tada: This is the best demo ever! :confetti_ball:`)
  } else {
    await respond('command must be of this format `setup [repository_owner] [repository_name] [repository_workflow] [jira_project_shortname]`')
  }
})

/**
* Action to deploy a release
*/
slack_app.action("deploy_release", async ({ ack, respond, say, client, body, payload, ...args }) => {
  await ack();

  const [ repo, tag ] = payload.value.split('|')
  const { owner, workflow } = getRepo(repo);

  if (workflow) {
    try {
      await dispatchWorkflow(owner, repo, workflow, tag)
      await say({
        thread_ts: body.message.ts,
        text: ':runner: Initiating deploy...',
      })
    } catch (e) {
      await respond({
        thread_ts: body.message.ts,
        text: ':x: Workflow could not be initiated',
      })
      return
    }

    // Wait a couple seconds to allow github to insert new run to db
    await delay(2000)
    const workflowRun = await getLatestWorkflowRun(owner, repo, workflow)

    const workflowRunInfo = workflowRun ? `The workflow can be found here: ${workflowRun.html_url}` : ''
    await say({
      thread_ts: body.message.ts,
      text: `:rocket: A deploy workflow has been initiated by <@${body.user.id}>. ${workflowRunInfo}`,
    })
  } else {
    await respond({
      thread_ts: body.message.ts,
      text: ':x: Workflow configuration for this repo not found!',
    })
  }
})

/**
* Function called after a new release has been published
*/
const onNewRelease = async (repository, release) => {
  // Send message to all buffet's channels
  const channels = await getChannels();
  channels.forEach(channel => {
    sendNewReleaseMessage(channel, repository, release)
  })
}

const sendNewReleaseMessage = async (channel, repository, release) => {
  const { workflow, jira_project } = getRepo(repository.name);

  const jira_issues = await getJiraLinks(release.body, jira_project)
  const jira_links = jira_issues
    .reduce((links, issue) => links + `\n - ${issue.self}`, '') // Format links for display

  const repo_section = `:octopus: *Repo:* <${repository.html_url}|${repository.name}>`
  const tag_section = `:label: *Tag:* <${release.html_url}|${release.name} - ${release.tag_name}>`
  const jira_section = `:earth_americas: *JIRA stories*:${jira_issues.length ? jira_links : ' no issues found'}`
  const description_section = `:page_with_curl: *Description:*\n${release.body}`

  const result = await slack_app.client.chat.postMessage({
    channel: channel.id,
    text: `${repository.name} just posted a new release: ${release.url}`,
    unfurl_links: false,
    unfurl_media: false,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:wave: *A new release has been published* :pray:`
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Release info:*\n ${repo_section}\n${tag_section}\n${jira_section}\n${description_section}\n`
        }
      },
    ]
  });

  if (workflow) {
    await slack_app.client.chat.postMessage({
      channel: channel.id,
      text: `A deploy workflow has been setup for this repo`,
      thread_ts: result.message.ts,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ':robot_face: A deploy workflow has been setup for this repo!'
          }
        },
        {
          "type": "actions",
          "elements": [
            {
              "type": "button",
              "text": {
                "type": "plain_text",
                "text": "Deploy"
              },
              "style": "primary",
              "value": `${repository.name}|${release.tag_name}`,
              "action_id": "deploy_release"
            }
          ]
        },
      ]
    })
  }
}

/**
* Gets all channels current bot is invited to
*/
const getChannels = async () => {
  try {
    const resp = await slack_app.client.users.conversations({
      user: app_info.user_id
    });
    return resp.channels
  } catch (e) {
    return []
  }
}


///// GITHUB //////

/**
* Hook that is run when a new release is published
*/
webhooks.on('release', async ({ id, name, payload }) => {
  const { action, repository, release } = payload
  if (action === 'released') {
    await onNewRelease(repository, release)
  }
});

/**
* Creates a webhook back to this app given an owner and repo
*/
const createWebhook = async (owner, repo) => {
  // Will error if a webhook with this configuration already exists
  return await octokit.request(`POST /repos/${owner}/${repo}/hooks`, {
    owner: owner,
    repo: repo,
    name: 'web',
    active: true,
    events: [
      'release'
    ],
    config: {
      url: GITHUB_GLITCH_CALLBACK_URL,
      content_type: 'json',
      secret: GITHUB_WEBHOOK_SECRET
    }
  });
}

/**
* Runs a workflow for a tag on a repo
*/
const dispatchWorkflow = async (owner, repo, workflow, tag) => {
  const resp = await octokit.request(`POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`, {
    owner: owner,
    repo: repo,
    workflow_id: workflow,
    ref: tag,
    inputs: {
      tag
    }
  })
}

/**
* Gets the latest github repo workflow run
*/
const getLatestWorkflowRun = async (owner, repo, workflow) => {
  try {
    const resp = await octokit.request(`GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs`, {
      owner: owner,
      repo: repo,
      workflow_id: workflow
    })
    return resp.data.workflow_runs[0]
  } catch (e) {
    return null
  }
}


///// JIRA /////

/**
* Returns configs for all jira issues found in a string
*/
const getJiraLinks = async (text, project) => {
  const jira_issues = project ? [...new Set(parseJiraIssues(text, project))] : [] // Scrape and dedup jira issues
  const responses = jira_issues.length ? await Promise.all(jira_issues.map(issue => getJiraIssue(issue))) : []
  return responses.filter(issue => issue) // Remove any matches that were not found
}

/**
* Gets jira issue from Atlassian API
*/
const getJiraIssue = async (issue) => {
  try {
    const resp = await axios.get(JIRA_BASE_URL + `/issue/${issue}`, {
      headers: {
        ContentType: 'application/json',
        ...generateAuthHeader()
      }
    });
    return resp.data
  } catch (e) {
    return null
  }
}

/**
* Matches jira issue names in a string
*/
const parseJiraIssues = (text, project) => {
  return text.match(new RegExp(`(${project}-\\d+)`, 'g'))
}

/**
* Creates authentication header for Atlassian API
*/
const generateAuthHeader = () => {
  const token = `${JIRA_USER_EMAIL}:${JIRA_API_KEY}`
  const encodedToken = Buffer.from(token, 'binary').toString('base64')
  return {Authorization: `Basic ${encodedToken}`};
}

///// HELPERS //////

const delay = t => new Promise(resolve => setTimeout(resolve, t));
