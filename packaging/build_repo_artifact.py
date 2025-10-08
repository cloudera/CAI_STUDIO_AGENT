#!/usr/bin/env python

import sys
import json
import os

def main():
  fname = sys.argv[1]
  if not fname:
    raise Exception("no filename provided")

  PKG_VERSION = os.environ.get('PKG_VERSION')
  LAST_COMMIT_ID = os.environ.get('LAST_COMMIT_ID')
  GBN = os.environ.get('GBN')
  MAINTENANCE_VERSION = PKG_VERSION.split('-b')[1]
  short_pkg_version = PKG_VERSION.split('-')[0]
  with open(fname, "w") as f:
    f.write(json.dumps({
      "assembly_metadata_version": 1,
      "runtimes": [
        {
          "image_identifier": f"docker.repository.cloudera.com/cloudera/studio/cloudera-ai-agent-studio:{PKG_VERSION}",
          "runtime_metadata_version": 2,
          "editor": "PBJ Workbench",
          "kernel": "Agent Studio",
          "description": "Agent Studio runtime provided by Cloudera",
          "edition": "Agent Studio",
          "full_version": f"{short_pkg_version}.{MAINTENANCE_VERSION}",
          "short_version": short_pkg_version,
          "maintenance_version": int(MAINTENANCE_VERSION),
          "git_hash": LAST_COMMIT_ID,
          "gbn": int(GBN) if GBN else GBN
        },
      ],
    }, indent=4))
    f.write('\n')

  os.system(f'cat {fname}')

if __name__ == "__main__":
  main()
