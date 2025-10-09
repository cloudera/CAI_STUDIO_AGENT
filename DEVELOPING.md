# Remote Session Development for Agent Studio

*Docs to come*


# Local Development for Agent Studio

Agent Studio can be developed and tested locally in a Docker container. When developing locally,
a CAI project must still be created and referenced to your local environment in order to deploy and track 
specific resources accessed via the `cmlapi`. Follow the instructions in `env.example` to see how to 
prepare your local development.

## Using the Dev Container

### Prerequisites
- Docker installed and running
- VS Code or Cursor with Dev Containers extension

### Set up `.env` to track a project
* Go to a CAI workbench instance 
* Follow instructions in `env.example` to pull env vars from a session into your local
* Grab `/etc/ssl/certs/ca-certificates.crt` from a session and save it to your working directory as `ca-certificates.crt`

### Setup Steps
1. Open the project in VS Code or Cursor
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Select "Dev Containers: Rebuild and Reopen in Container"
4. Wait for the container to build and start

### Bootstrapping the environment.
Bootstrapping your local development environment will make sure that the first few steps 
of the AMP installation are completed such as pulling down Node and other dependencies for development.
Once inside the dev container, run:
```bash
# Option 1
. bin/bootstrap

# Option 2
source bin/bootstrap
```

### Starting the Development Server
Once inside the dev container, run:
```bash
./bin/local-dev.sh
```

### Adding VS Code Extensions
Edit `.devcontainer/devcontainer.json` and add extensions to the `customizations.vscode.extensions` array.

### Modifying Environment Variables
Update the `containerEnv` section in `.devcontainer/devcontainer.json`.
