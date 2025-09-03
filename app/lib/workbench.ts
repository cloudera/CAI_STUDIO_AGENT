/**
 * Compare two different versions of Cloudera AI Workbench. Workbench
 * gitShas follow semantic versioning, and this verion checker
 * only checks out to the patch version (i.e., '2.0.47' and '2.0.47-b450'
 * will evalute to being equal).
 *
 * if verion a is greater than version b, returns 1.
 * if version a is less than b, returns 0.
 * returns 0 if both versions evaluate to the same patch version.
 */
export const compareWorkbenchVersions = (a: string, b: string) => {
  const sanitizedA = a.split('-')[0];
  const sanitizedB = b.split('-')[0];

  const [aMajor, aMinor, aPatch] = sanitizedA.split('.').map(Number);
  const [bMajor, bMinor, bPatch] = sanitizedB.split('.').map(Number);

  if (aMajor > bMajor) {
    return 1;
  }
  if (aMajor < bMajor) {
    return -1;
  }
  if (aMinor > bMinor) {
    return 1;
  }
  if (aMinor < bMinor) {
    return -1;
  }
  if (aPatch > bPatch) {
    return 1;
  }
  if (aPatch < bPatch) {
    return -1;
  }

  // Versions are the same
  return 0;
};
