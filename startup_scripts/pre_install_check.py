from urllib.parse import urlparse
import sys
import os


def check_for_tls_workspace():
    try:
        urlobj = urlparse(os.environ["CDSW_PROJECT_URL"])
        return urlobj.scheme == "https"
    except KeyError:
        print("Environment variable 'CDSW_PROJECT_URL' is not set.")
    except Exception as e:
        print(f"Unexpected error while checking URL: {e}")
        
    return False

def main():
    if not check_for_tls_workspace():
        print(f"Cannot install Agent Studio in a non-TLS workspace")
        sys.exit(1)

if __name__ == "__main__":
    main()