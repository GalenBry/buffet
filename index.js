const { createServer } = require("http");

const { App } = require('@slack/bolt');
const { Webhooks, createNodeMiddleware } = require("@octokit/webhooks");
const { Octokit } = require("@octokit/rest");

const store = require('./store');

const GITHUB_USER_NAME = 'GalenBry'
const GITHUB_GLITCH_CALLBACK_URL = 'https://beaded-periwinkle-ring.glitch.me/api/github/webhooks'

/////// Setup ///////

// Start Slack app
let app_info; // stores info about this bot
const slack_app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN ,
  // Socket Mode doesn't listen on a port, but in case you want your app to respond to OAuth,
  // you still need to listen on some port!
  port: process.env.PORT || 3000
});
(async () => {
  await slack_app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');

  app_info = await slack_app.client.auth.test()
  // console.log(app_info)
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


///// Slack methods /////

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

slack_app.command("/buffet", async ({command, ack, say, respond }) => {
  // console.log(command)
  await ack();

  const [action, ...values] = command.text.split(' ')

  // TODO: better args validation
  if (action === 'setup' && values.length === 2) {
    const [owner, repo] = values
    await setupWebhook(owner, repo, say, respond)
  } else {
    await respond("command must be of this format `setup [repository_owner] [repository_name]`")
  }
})

const onNewRelease = async (repository, release) => {
  const channels = await getChannels();

  // Iterate over all channels bot is invited to and send release message
  channels.forEach(async (channel) => {
    await sendNewReleaseMessage(channel, repository, release)
  })
}

const sendNewReleaseMessage = async (channel, repository, release) => {
  console.log(repository)
  console.log(release)

  const result = await slack_app.client.chat.postMessage({
    channel: channel.id,
    text: `${repository.name} just posted a new release: ${release.url}`,
    "unfurl_links": false,
    "unfurl_media": false,
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
          text: `*Release info:*\n :octopus: *Repo:* <${repository.html_url}|${repository.name}>\n:label: *Tag:* <${release.html_url}|${release.name} - ${release.tag_name}>\n:page_with_curl: *Description:*\n`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${release.body}`,
        }
      }
    ]
  });
}



///// Github methods //////

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
