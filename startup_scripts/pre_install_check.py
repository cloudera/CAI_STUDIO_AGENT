import urllib.request
from urllib.parse import urlparse
import sys, base64, json, ssl
import os


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