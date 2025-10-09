import subprocess


def ensure_correct_base_path():
    import os

    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    if is_composable:
        subdirectory = "agent-studio"
        app_data_dir = os.path.join("/home/cdsw", subdirectory)
        print(f"Changing working directory to '{app_data_dir}'")
        os.chdir(app_data_dir)


ensure_correct_base_path()

subprocess.run(
    [f"bash bin/start-deploy-job.sh"],
    shell=True,
    check=True,
)

print("Deployment job comleted successfully.")
