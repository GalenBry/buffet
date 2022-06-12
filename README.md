# Buffet Slack App
[Buffet](https://github.com/GalenBry/buffet) is a slack app designed to be a one stop shop for release and deployment processes.

Are you tired of needing to manually communicate and coordinate releases with your team?
Use Buffet in Slack now to boost productivity by eliminating the manual process of writing out
release notes, providing important links like jira tickets or release diffs, and running deploys.

### __It's so great that Buffet uses it!__

This app is hosted in Glitch and has a Github deployment workflow that will automatically push the release
to Glitch when the deploy button in slack is pressed.

## Usage
To get started, simply invite the Buffet app to a channel you wish to receive release alerts for and
use the /buffet command to setup an integration with a github repository of your choosing.

This is the syntax to setup an integration:

`/buffet setup [repository_owner] [repository_name] [workflow_file] [jira_project_shortname]`

Once a repo has been setup, any new releases published for this repo will trigger a detailed message
in any channels buffet has been invited to. If there are any Jira issues from the supplied project included
in the description of the release then links will be supplied to them. If a Github deploy workflow has been 
setup then you will see a message to this effect and a deploy button that will kick off the workflow and provide 
a link to it.

Currently existing integrations:
- Github releases and actions
- Jira

### Arguments

`repository_owner`: Github user or organization that owns the repository *(ex. `GalenBry`)*

`repository_name`: name of Github repository *(ex. `buffet`)*

`workflow_file`: name or ID of Github deployment workflow *(ex. `main.yml`)*

`jira_project_shortname`: jira project abbreviation used to track work on this repo *(ex. `EX`)*


## Implementation
Buffet uses the Bolt javascript framework in combination with Github webhooks and REST API to provide immediate feedback and communication.
Buffet also uses the Atlassian API for requests to Jira.

## Issues
Buffet currently uses an in memory datastore which means that any time new code is pushed
