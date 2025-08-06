
# This is a startup script to run agent studio using ML Runtime image.
import subprocess
import os
import sys

# Add the app directory to Python path so we can import startup_scripts package
app_dir = os.getenv("APP_DIR", "/studio_app")
if app_dir not in sys.path:
    sys.path.insert(0, app_dir)

# Import utility functions
from startup_scripts.startup_utils import ensure_correct_base_path, install_cmlapi


def move_studio_data() -> bool:
    """Move studio-data directory to /home/cdsw directory."""
    print("Moving studio-data directory...")
    
    app_dir = os.getenv("APP_DIR")
    target_dir = os.getenv("APP_DATA_DIR")
    
    if not app_dir:
        print("APP_DIR environment variable not set")
        return False
    if not target_dir:
        print("APP_DATA_DIR environment variable not set")
        return False
    
    source_path = os.path.join(app_dir, "studio-data")
    target_path = os.path.join(target_dir, "studio-data")
    
    def recursive_merge(src_dir, dst_dir):
        """Recursively merge source directory into destination, giving preference to source."""
        """Here we are assuming that source directory will never have workflows directory and it will only override cloudera provided tool templates and assets."""
        import shutil
        
        for item in os.listdir(src_dir):
            src_item = os.path.join(src_dir, item)
            dst_item = os.path.join(dst_dir, item)
            
            if os.path.isdir(src_item):
                # Handle directory
                if os.path.exists(dst_item):
                    if os.path.isdir(dst_item):
                        # Both are directories, merge recursively
                        print(f"Merging directory: {src_item} -> {dst_item}")
                        recursive_merge(src_item, dst_item)
                    else:
                        # Destination exists but is not a directory, skip
                        print(f"Skipping {src_item} - destination exists as file")
                else:
                    # Destination doesn't exist, move the directory
                    print(f"Moving directory: {src_item} -> {dst_item}")
                    shutil.move(src_item, dst_item)
            else:
                # Handle file
                # File exists in destination, give preference to source
                print(f"Moving file: {src_item} -> {dst_item}")
                shutil.move(src_item, dst_item)
    
    try:
        # Check if source directory exists
        if not os.path.exists(source_path):
            print(f"Source directory '{source_path}' does not exist - skipping move")
            return True
        
        # Check if target already exists
        if os.path.exists(target_path):
            if os.path.isdir(target_path):
                print(f"Target directory '{target_path}' already exists - performing recursive merge")
                # Perform recursive merge
                recursive_merge(source_path, target_path)
                # Remove source directory if it's empty after merge
                try:
                    if not os.listdir(source_path):
                        os.rmdir(source_path)
                        print(f"Removed empty source directory: {source_path}")
                    else:
                        print(f"Source directory {source_path} still contains files after merge")
                except OSError:
                    print(f"Could not remove source directory {source_path} - may not be empty")
            else:
                print(f"Target '{target_path}' exists but is not a directory - cannot merge")
                return False
        else:
            # Target doesn't exist, perform simple move
            import shutil
            shutil.move(source_path, target_path)
            print(f"Successfully moved '{source_path}' to '{target_path}'")
        
        return True
        
    except PermissionError as e:
        print(f"Permission denied while moving studio-data: {e}")
        return False
    except OSError as e:
        print(f"OS error while moving studio-data: {e}")
        return False
    except Exception as e:
        print(f"Unexpected error while moving studio-data: {e}")
        return False


def main():
    """Main function to run the application."""
    print("Starting Agent Studio...")
    
    # Ensure correct base path
    try:
        working_dir, app_dir = ensure_correct_base_path()
    except ValueError as e:
        print(f"Configuration error: {e}")
        return 1
    
    # Move studio-data directory to /home/cdsw
    try:
        success = move_studio_data()
        if not success:
            print("Failed to move studio-data directory - stopping application startup")
            return 1
    except Exception as e:
        print(f"Error during studio-data move: {e}")
        print("Failed to move studio-data directory - stopping application startup")
        return 1
    
    # Call initialize-project-defaults.py
    try:
        script_path = os.path.join(app_dir, "bin", "initialize-project-defaults.py")
        venv_path = os.path.join(app_dir, ".venv")
        env_vars = os.environ.copy()
        env_vars["VIRTUAL_ENV"] = venv_path
        env_vars["PATH"] = f"{venv_path}/bin:{env_vars.get('PATH', '')}"
        print(f"Using existing virtual environment at {venv_path}")
        result = subprocess.run([f"uv run {script_path}"], shell=True, capture_output=True, text=True, env=env_vars)
        print("Project defaults initialization complete.", result.returncode)
        if result.returncode != 0:
            print("=== STDOUT ===")
            print(result.stdout)
            print("=== STDERR ===")
            print(result.stderr)
            return result.returncode
    except subprocess.CalledProcessError as e:
        print(f"Failed to initialize project defaults: {e}")
        print(f"Return code: {e.returncode}")
        if e.stderr:
            print(f"Stderr: {e.stderr}")
        return e.returncode
    except Exception as e:
        print(f"Unexpected error during project defaults initialization: {e}")
        return 1
    
    # Install cmlapi
    try:
        success = install_cmlapi()
        if not success:
            print("cmlapi installation failed - stopping application startup")
            return 1
    except Exception as e:
        print(f"Error during cmlapi installation: {e}")
        print("cmlapi installation failed - stopping application startup")
        return 1
    
    # Call run-app.py
    try:
        CDSW_APP_PORT = os.environ.get("CDSW_APP_PORT")
        script_path = os.path.join(app_dir, "bin", "start-app-script.sh")
        result = subprocess.run([f"bash {script_path} {CDSW_APP_PORT}"], shell=True, check=True)
        print("Application startup complete.", result.returncode)
        if result.returncode != 0:
            print("=== STDOUT ===")
            print(result.stdout)
            print("=== STDERR ===")
            print(result.stderr)
        return result.returncode
    except subprocess.CalledProcessError as e:
        print(f"Failed to start application: {e}")
        print(f"Return code: {e.returncode}")
        if e.stderr:
            print(f"Stderr: {e.stderr}")
        return e.returncode
    except Exception as e:
        print(f"Unexpected error during application startup: {e}")
        return 1


if __name__ == "__main__":
    main()