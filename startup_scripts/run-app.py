import subprocess
import os 

def ensure_correct_base_path():
    import os
    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    deploy_mode: str = os.getenv("AGENT_STUDIO_DEPLOY_MODE", "amp")
    app_dir = os.getcwd()
    working_dir = app_dir
    if is_composable:
        if deploy_mode == "amp":
            subdirectory = "agent-studio"
            working_dir = os.path.join("/home/cdsw", subdirectory)
            app_dir = working_dir
        else:
            working_dir = os.getenv("APP_DATA_DIR")
            app_dir = os.getenv("APP_DIR")

        print(f"Changing working directory to '{working_dir}'")
        os.chdir(working_dir)
    
    os.environ["APP_DIR"] = app_dir
    os.environ["APP_DATA_DIR"] = working_dir
    return app_dir

app_dir = ensure_correct_base_path()

CDSW_APP_PORT = os.environ.get("CDSW_APP_PORT")
out = subprocess.run([f"bash {app_dir}/bin/start-app-script.sh {CDSW_APP_PORT}"], shell=True, check=True)
print(out)

print("App start script is complete.")
