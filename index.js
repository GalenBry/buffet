const { createServer } = require("http");
const axios = require('axios');

const { App } = require('@slack/bolt');
const { Webhooks, createNodeMiddleware } = require("@octokit/webhooks");
const { Octokit } = require("@octokit/rest");

const { addRepo, getRepo } = require('./store');

const GITHUB_USER_NAME = 'GalenBry'
const GITHUB_GLITCH_CALLBACK_URL = 'https://beaded-periwinkle-ring.glitch.me/api/github/webhooks'
const JIRA_USER_EMAIL = 'galen.bryant@outlook.com'
const JIRA_BASE_URL = 'https://slack-test-app.atlassian.net/rest/api/2'

/////// SETUP ///////

// Start Slack app
let app_info; // will store info about this bot
const slack_app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000
});
(async () => {
  await slack_app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');

  app_info = await slack_app.client.auth.test()
})();

// Create Github REST client
const octokit = new Octokit({
  auth: process.env.GITHUB_API_SECRET
});

// Start listener for github events
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET,
});
createServer(createNodeMiddleware(webhooks)).listen(3000)
console.log('github server started')


////// SLACK //////

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
    console.log(e)
    return []
  }
}

/**
* Command to setup a ecosystem around a repo
*/
slack_app.command("/buffet", async ({command, ack, say, respond }) => {
  await ack();

  const [action, ...values] = command.text.split(' ')

  // TODO: better args validation
  if (action === 'setup' && values.length === 3) {
    const [owner, repo, jira_project] = values
    await setupWebhook(owner, repo, say, respond)
    
    // Save repo settings for later
    addRepo({
      name: repo,
      owner,
      jira_project
    })
  } else {
    await respond("command must be of this format `setup [repository_owner] [repository_name]`")
  }
})

const onNewRelease = async (repository, release) => {  
  // Send message to all bot channels
  const channels = await getChannels();
  channels.forEach(channel => {
    sendNewReleaseMessage(channel, repository, release)
  })
}

const sendNewReleaseMessage = async (channel, repository, release) => {
  // Parse release description to get references to Jira issues and find links to them
  const { jira_project } = getRepo(repository.name);
  const jira_issues = jira_project ? parseJiraIssues(release.body, jira_project) : []
  const responses = jira_issues ? await Promise.all(jira_issues.map(issue => getJiraIssue(issue))) : []
  const matched_issues = responses
    .filter(issue => issue) // Remove any matches that were not found
  const jira_links = matched_issues
    .reduce((links, issue) => links + `\n - ${issue.self}`, '') // Format links for display

  const repo_section = `:octopus: *Repo:* <${repository.html_url}|${repository.name}>`
  const tag_section = `:label: *Tag:* <${release.html_url}|${release.name} - ${release.tag_name}>`
  const jira_section = `:earth_americas: *JIRA stories*:${matched_issues.length ? jira_links : ' no issues found'}`
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
          text: `:wave: *Buffet has detected a new release*`
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
}



///// GITHUB //////

webhooks.on('release', async ({ id, name, payload }) => {
  if (payload.action === 'released') {
    const { repository, release } = payload
    await onNewRelease(repository, release)
  }
});

const setupWebhook = async (owner, repo, say, respond) => {
  try {
    const resp = await createWebhook(owner, repo)
    await say(`Buffet is now listening to releases on this repository: ${resp.url}`)
  } catch (e) {
    console.log(e)
    await respond(`An issue occured while creating a webhook for this repository: ${e.request.url}`)
  }
}

/**
* Creates a webhook back to this app given an owner and repo
*/
const createWebhook = async (owner, repo) => {
  // validate that a hook is not already created for this app
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
      secret: process.env.GITHUB_WEBHOOK_SECRET
    }
  });
}


///// JIRA METHODS /////

const generateAuthHeader = () => {
  const token = `${JIRA_USER_EMAIL}:${process.env.JIRA_API_KEY_2}`
  const encodedToken = Buffer.from(token, 'binary').toString('base64')
  const decodedToken = Buffer.from(encodedToken, 'base64').toString('binary')
  return {Authorization: `Basic ${encodedToken}`};
}

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
    // console.log(e)
    return null
  }
}

const parseJiraIssues = (text, project) => {
  return text.match(new RegExp(`(${project}-\\d+)`, 'g'))
}
