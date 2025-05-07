"""
async_load_test.py
Fire-and-forget load generator:  N launches per minute, no status polling.
Requires:  python -m pip install aiohttp
"""
import os, json, base64, asyncio, aiohttp
from time import monotonic

ENDPOINT         = "https://modelservice.cmlgenai.apps.apps.cml-gpu-vantage2-ded.kcloud.cloudera.com/model?accessKey=mdmghjvl6zx4yj9mpa84pcctd9z6a8o4"
WORKFLOW_INPUTS  = {"expression": "2+2+2+2+2"}
CDSW_APIV2_KEY   = os.environ["CDSW_APIV2_KEY"]           # will raise if missing

LOAD_TPM         = 600      # launches per minute
LOAD_TIME_MIN    = 1       # how many minutes to sustain the load
LAUNCH_INTERVAL  = 60 / LOAD_TPM   # seconds between launches

HEADERS = {
    "Authorization": f"Bearer {CDSW_APIV2_KEY}",
    "Content-Type":  "application/json",
}

# ---------- async helpers --------------------------------------------------

def build_payload():
    """Return the JSON body for one kickoff request."""
    encoded = base64.b64encode(
        json.dumps(WORKFLOW_INPUTS).encode("utf-8")
    ).decode("utf-8")
    return {
        "request": {
            "action_type":   "kickoff",
            "kickoff_inputs": encoded,
        }
    }


async def kickoff(session: aiohttp.ClientSession):
    """Send one kickoff; log non-200 responses, but don’t raise."""
    try:
        async with session.post(ENDPOINT, json=build_payload()) as r:
            if r.status != 200:
                data = await r.json()
                print(f"kickoff failed: HTTP {data}")
            else:
                data = await r.json()
                print(data)
    except Exception as exc:
        print(f"kickoff exception: {exc}")


async def launch_loop():
    total_launches = LOAD_TPM * LOAD_TIME_MIN
    next_deadline  = monotonic()                 # keeps a tight schedule

    timeout = aiohttp.ClientTimeout(total=10)    # seconds
    async with aiohttp.ClientSession(timeout=timeout, headers=HEADERS) as session:
        for _ in range(total_launches):
            asyncio.create_task(kickoff(session))        # fire-and-forget
            next_deadline += LAUNCH_INTERVAL
            await asyncio.sleep(max(0, next_deadline - monotonic()))

    print("Finished scheduling all launches 🎉")


# ---------- entry-point ----------------------------------------------------

if __name__ == "__main__":
    print(f"LOAD TESTING!  {LOAD_TPM} launches/min for {LOAD_TIME_MIN} min")
    asyncio.run(launch_loop())
