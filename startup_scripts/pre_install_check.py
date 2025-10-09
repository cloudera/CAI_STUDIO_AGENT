"""
This script is used to check workbench environment requirements for Agent Studio. Specifically,
it checks if the workspace is TLS-enabled and if unauthenticated access to the app is enabled.
If TLS is not enabled, then unathenticated access to applications in the workbench must be enabled.

This script is meant to run from the APP_DIR as it's dependent on the startup_scripts
package being available on the path.
"""

import urllib.request
from urllib.parse import urlparse
import sys, base64, json, ssl
import os
import subprocess

def ensure_correct_base_path() -> tuple[str, str]:
    """
    Ensure we have entered the correct base path, APP_DATA_DIR,
    for the application.
    """
    app_data_dir = os.getenv("APP_DATA_DIR", "/home/cdsw")
    app_dir = os.getenv("APP_DIR", os.getcwd())

    # Validate required environment variables
    if not app_data_dir:
        raise ValueError("APP_DATA_DIR environment variable is required")
    if not app_dir:
        raise ValueError("APP_DIR environment variable is required")

    # Determine whether this application is being ran in a composable environment
    # (i.e. AI Studios mode), in which case we also explicitly set our working
    # directory.
    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    if is_composable:
        subdirectory = "agent-studio"
        app_data_dir = os.path.join("/home/cdsw", subdirectory)
        app_dir = os.path.join("/home/cdsw", subdirectory)

    print(f"Application directory: {app_dir}")
    print(f"Application data directory: {app_data_dir}")

    if not os.path.exists(app_data_dir):
        os.makedirs(app_data_dir)
    os.chdir(app_data_dir)

    # Add our baseline app directory to the path.
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)
    
    # Also set PYTHONPATH environment variable for subprocesses
    pythonpath = os.environ.get("PYTHONPATH", "")
    if pythonpath:
        os.environ["PYTHONPATH"] = f"{app_dir}:{pythonpath}"
    else:
        os.environ["PYTHONPATH"] = app_dir
    
    return app_data_dir, app_dir

def ensure_dotenv() -> bool:
    """Ensure python-dotenv package is installed."""
    try:
        import dotenv
        return True
    except ImportError:
        print("python-dotenv not found. Installing...")
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', 'python-dotenv'], check=True)
            print("Successfully installed python-dotenv")
            
            # Force reload of the site-packages and try importing again
            import importlib
            import site
            importlib.reload(site)
            
            # Try importing again after reloading site-packages
            try:
                import dotenv
                return True
            except ImportError:
                # If still fails, try adding the site-packages to path manually
                import sysconfig
                site_packages = sysconfig.get_paths()["purelib"]
                if site_packages not in sys.path:
                    sys.path.insert(0, site_packages)
                import dotenv
                return True
                
        except subprocess.CalledProcessError as e:
            print(f"Failed to install python-dotenv: {e}")
            return False
        except ImportError as e:
            print(f"Failed to import dotenv after installation: {e}")
            print("Note: You may need to restart the Python process for the installation to take effect.")
            return False


def load_dotenv_file() -> None:
    """Load environment variables from .env file if it exists."""
    if ensure_dotenv():
        try:
            from dotenv import load_dotenv as _load_dotenv
            # Try multiple possible locations for .env file
            env_files = ['.env', '.env.local']
            for env_file in env_files:
                if os.path.exists(env_file):
                    _load_dotenv(env_file)
                    print(f"Loaded environment variables from {env_file}")
                    break
            else:
                print("No .env file found in common locations")
        except Exception as e:
            print(f"Error loading .env file: {e}")




def check_for_tls_workspace() -> bool:
    try:
        urlobj = urlparse(os.environ["CDSW_PROJECT_URL"])
        return urlobj.scheme == "https"
    except KeyError:
        print("Environment variable 'CDSW_PROJECT_URL' is not set.")
    except Exception as e:
        print(f"Unexpected error while checking URL: {e}")

    return False


def check_unauthenticated_access_to_app_enabled() -> bool:
    api_url = os.getenv("CDSW_API_URL")
    path = "site/config/"
    api_key = os.getenv("CDSW_API_KEY")

    url = "/".join([api_url, path])
    
    auth_string = f"{api_key}:"
    auth_bytes = auth_string.encode('ascii')
    auth_b64 = base64.b64encode(auth_bytes).decode('ascii')
    
    req = urllib.request.Request(
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth_b64}"
        }
    )
    
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    with urllib.request.urlopen(req, context=ssl_context) as response:
        response_data = json.loads(response.read().decode('utf-8'))
    
    allow_unauthenticated_access_to_app = response_data.get(
        "allow_unauthenticated_access_to_app"
    )
    return allow_unauthenticated_access_to_app

def main():
    ensure_correct_base_path()
    load_dotenv_file()
    is_tls_enabled = check_for_tls_workspace()
    
    if is_tls_enabled:
        print("pre-install checks passed")
    else:
        # Non-TLS workspace, check if unauthenticated access is enabled
        try:
            unauthenticated_access_enabled = check_unauthenticated_access_to_app_enabled()
            if unauthenticated_access_enabled:
                print("pre-install checks passed")
            else:
                print("Pre-install check failed: Unauthenticated access to app is not enabled in non-TLS workspace")
                sys.exit(1)
        except Exception as e:
            print(f"Pre-install check failed: Unable to verify unauthenticated access setting: {e}")
            sys.exit(1)

if __name__ == "__main__":
    main()