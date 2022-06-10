// Simple in memory datastore

// example repo
// {
//   name: string;
//   owner: string;
//   workflow: string;
//   jira_project: string;
// }

const repos = {
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
