import Git from 'simple-git';

/**
 * Get the status for all tracked files in git.
 */
export default async function gitTrackedStatus () {
  let p = new Promise(res => {
    Git().status((err, stats) => {
      res(stats ? stats.files : []);
    });
  });
  return await p;
};
