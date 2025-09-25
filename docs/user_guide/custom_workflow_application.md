# Creating Custom UIs and Applications for Deployed Workflows

This guide discusses how to create your own applications and UIs to drive Agent Studio's deployed workflows using the API endpoint provided by each deployed workflow Application.

## Overview

Let's overview the full ecosystem that Agent Studio provides when adding the studio to your project:
* The studio application itself, which is a [Workbench Application](https://docs.cloudera.com/machine-learning/cloud/applications/topics/ml-applications-c.html)
* An Ops and Metrics server powered by the open-source [Phoenix](https://phoenix.arize.com/) ([Github](https://github.com/Arize-ai/phoenix)) to log and retrieve workflow runs
* For every deployed workflow, a dedicated [AI Workbench Application](https://docs.cloudera.com/machine-learning/cloud/applications/topics/ml-applications-c.html) that serves both the UI and API endpoints

For every workflow that you deploy, an Application serves as a "command center" that allows you to test your workflow. This Application also exposes an API endpoint that can be used to kickoff the workflow, retrieve events, and access other workflow data.

The lifecycle of an Agent Studio workflow execution is as follows (see **Figure 1**):
1) The end user interacts with the deployed workflow's Application either through the UI or via direct HTTP API calls to execute ("kickoff") a workflow. Once a workflow has initiated execution, the Application responds with a unique ID that corresponds with this workflow request (i.e. `{"trace_id": "4ec9e40f8e68d218d2dbae55a8120be0"}`)
2) The newly kicked off workflow will complete execution within the Model, and continuously stream workflow **events** (task start/stop, tooling start/stop, LLM completions, etc.), as well as **traces**, to the telemetry server of the deployed workflow. Agent Studio logs workflow traces using [OpenInference](https://github.com/Arize-ai/openinference)'s telemetry standard.
3) The UI polls the events of a specific workflow (queried by the `trace_id` created when the workflow was kicked off). The UI will then display live visuals of how the workflow is progressing.

## Custom Applications

Users have the ability to create custom applications that can interact with deployed workflow Applications. A custom workflow application needs to:

* Execute (or "kickoff") a workflow via direct HTTP requests to the Application's API endpoints
* Retrieve events from a kicked off workflow from the same Application's API endpoints to display results to the end user

Custom application builders need access to the unified API endpoints provided by the deployed workflow Application to build successful custom experiences:

1. **Workflow Kickoff API**: `/api/workflow/kickoff` - For executing workflows
2. **Workflow Events API**: `/api/workflow/events?trace_id=...` - For retrieving workflow events and status

### Unified Application API

Every deployed workflow exposes a comprehensive API through the deployed Workbench Application. The Application provides two main API endpoints:

#### Workflow Kickoff API (`/api/workflow/kickoff`)

This endpoint is used to start workflow executions. You can find the Application URL by navigating to your deployed workflow Application in the Workbench.

#### Workflow Events API (`/api/workflow/events`)

To track workflow progress and retrieve results, you can poll the Application's events endpoint. This API polls for a specific event stream of a given workflow execution (using the `trace_id` that is provided after kicking off a workflow). An example of what this API call looks like, and a simple way to check for completion of a workflow, is defined below:

```python
# Application API endpoint structure
APPLICATION_ENDPOINT = "https://<application-subdomain>.<workbench_url>.com"

def get_workflow_events(trace_id: str):
    response = requests.get(
        f"{APPLICATION_ENDPOINT}/api/workflow/events?trace_id={trace_id}",
        headers={"Authorization": f"Bearer {CDSW_APIV2_KEY}"}
    )
    data = response.json()
    return data["events"]

def get_workflow_status(trace_id: str):
    events = get_workflow_events(trace_id)
    
    status = {
        "complete": False,
        "output": None,
        "error": None
    }
    
    if len(events) > 0:
        last_event = events[-1]
        if last_event["type"] == "crew_kickoff_completed":
            status["complete"] = True
            # Extract output from the last event attributes
            status["output"] = last_event.get("attributes", {}).get("output")
        elif "error" in last_event.get("attributes", {}):
            status["complete"] = True
            status["error"] = last_event["attributes"]["error"]
    
    return status
```

The types of events that can be emitted are defined in https://docs.crewai.com/en/concepts/event-listener#available-event-types. 

### A Note on Conversational Workflows

Conversational workflows always expect two inputs to the workflow: `user_input` and `context`. Conversational context must be handled from within the application logic. An example of passing context may look like this:

```python
inputs = {
    "user_input": "what's the last message you said?", 
    "context": [
        {"role": "User", "content": "Well hello there!"},
        {"role": "System", "content": "Hi there! How can I assist you today?"}
    ]
}
```

*Note that a specific format of the context is not required, but it's suggested to adhere to standards that your LLMs are trained on. All of these inputs will be serialized into a string when passing information to the LLM.*

## Example: Custom Python Application for a Conversational Workflow

Here's a complete example of a Python application that interacts directly with deployed workflow endpoints:

```python
import requests
import json
import time
import os

class WorkflowClient:
    def __init__(self, application_endpoint):
        self.application_endpoint = application_endpoint
        self.api_key = os.environ.get("CDSW_APIV2_KEY")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def kickoff_workflow(self, inputs):
        """Start a workflow execution"""
        response = requests.post(
            f"{self.application_endpoint}/api/workflow/kickoff",
            json={"inputs": inputs},
            headers=self.headers
        )
        
        result = response.json()
        if not result["success"]:
            raise Exception(f"Failed to start workflow: {result}")
        
        return result["response"]["trace_id"]
    
    def get_workflow_status(self, trace_id):
        """Get current status of a workflow run"""
        response = requests.get(
            f"{self.application_endpoint}/api/workflow/events?trace_id={trace_id}",
            headers={"Authorization": f"Bearer {self.api_key}"}
        )
        
        events = response.json()
        
        status = {"complete": False, "output": None, "error": None}
        
        if len(events) > 0:
            last_event = events[-1]
            if last_event["type"] == "Crew.complete":
                status["complete"] = True
                status["output"] = last_event.get("attributes", {}).get("output")
            elif "error" in last_event.get("attributes", {}):
                status["complete"] = True
                status["error"] = last_event["attributes"]["error"]
        
        return status
    
    def run_workflow_sync(self, inputs, poll_interval=1):
        """Run workflow synchronously (blocks until complete)"""
        trace_id = self.kickoff_workflow(inputs)
        
        while True:
            status = self.get_workflow_status(trace_id)
            if status["complete"]:
                return status
            time.sleep(poll_interval)

# Usage example
if __name__ == "__main__":
    client = WorkflowClient(
        application_endpoint="https://your-workflow-app.your-domain.com"
    )
    
    # For a conversational workflow
    context = []
    
    while True:
        user_input = input("You: ")
        if user_input.lower() == 'quit':
            break
            
        inputs = {
            "user_input": user_input,
            "context": context
        }
        
        print("Agent is thinking...")
        result = client.run_workflow_sync(inputs)
        
        if result["error"]:
            print(f"Error: {result['error']}")
        else:
            agent_response = result["output"]
            print(f"Agent: {agent_response}")
            
            # Update context for next iteration
            context.append({"role": "User", "content": user_input})
            context.append({"role": "Assistant", "content": agent_response})
```

## Example: Custom Gradio UI for a Conversational Workflow

Here's an example of a Gradio UI built on top of direct HTTP requests:

```python
import gradio as gr
import time
import os
import requests
import json

# Configuration
APPLICATION_ENDPOINT = "https://your-workflow-app.your-domain.com"
CDSW_APIV2_KEY = os.environ.get("CDSW_APIV2_KEY")

def run_workflow(inputs):
    """Execute workflow via direct HTTP request"""
    response = requests.post(
        f"{APPLICATION_ENDPOINT}/api/workflow/kickoff",
        json={"inputs": inputs},
        headers={
            "Authorization": f"Bearer {CDSW_APIV2_KEY}",
            "Content-Type": "application/json"
        }
    )
    
    result = response.json()
    return result["response"]["trace_id"]

def get_workflow_status(trace_id):
    """Poll workflow status via Application API"""
    response = requests.get(
        f"{APPLICATION_ENDPOINT}/api/workflow/events?trace_id={trace_id}",
        headers={"Authorization": f"Bearer {CDSW_APIV2_KEY}"}
    )
    
    events = response.json()
    
    status = {"complete": False, "output": None}
    if len(events) > 0 and events[-1]["type"] == "crew_kickoff_complete":
        status["complete"] = True
        status["output"] = events[-1].get("attributes", {}).get("output")
    
    return status

def respond(user_message, chat_history, context):
    chat_history.append([user_message, None])
    context.append({"role": "User", "content": user_message})

    # Start workflow
    trace_id = run_workflow({
        "user_input": user_message,
        "context": context
    })

    # Poll for completion
    while True:
        time.sleep(1)
        status = get_workflow_status(trace_id)
        if status["complete"]:
            break

    agent_reply = status["output"]
    chat_history[-1][1] = agent_reply
    context.append({"role": "Assistant", "content": agent_reply})

    return chat_history, context

with gr.Blocks() as demo:
    gr.Markdown("## Agent Studio Chatbot (Direct HTTP)")

    chatbot = gr.Chatbot(label="Conversation")
    txt = gr.Textbox(label="Your Message", placeholder="Type a message...")
    context_state = gr.State([])

    txt.submit(
        fn=respond,
        inputs=[txt, chatbot, context_state],
        outputs=[chatbot, context_state]
    )

demo.queue().launch(server_port=int(os.getenv("CDSW_APP_PORT")))
```