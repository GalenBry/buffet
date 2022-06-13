// Simple in memory datastore

// example repo
// {
//   name: string;
//   owner: string;
//   workflow: string;
//   jira_project: string;
// }

const repos = {
  // Hard coded for demo just to be safe since Glitch will re-create this object on file change
  buffet: {
    name: 'buffet',
    owner: 'GalenBry',
    workflow: 'main.yml',
    jira_project: 'EX'
  }
};

exports.addRepo = (repo) => {
  repos[repo.name] = repo;
};

exports.getRepo = (repo_name) => {
  return repos[repo_name] || {};
};
