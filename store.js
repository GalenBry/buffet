// Simple in memory datastore

// example repo
// {
//   name: string;
//   owner: string;
//   jira_project: string;
// }

const repos = {
  buffet: {
    repo: 'buffet',
    owner: 'GalenBry',
    jira_project: 'EX'
  }
};

exports.addRepo = (repo) => {
  repos[repo.name] = repo;
};

exports.removeRepo = (repo) => {
  delete repos[name];
};

exports.getRepo = (repo_name) => {
  return repos[repo_name];
};
