import os
import uuid
from textwrap import dedent
from typing import Literal, Optional, Dict, Any, Type
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool
from ics import Calendar, Event
from dateutil.parser import parse
from typing import Literal
import json 
import argparse

class UserParameters(BaseModel):
    pass

class ToolParameters(BaseModel):
    action: Literal["create", "update", "delete"] = Field(description="Action type specifying the operation to perform on the calendar")
    calendar_path: str = Field(description="Path to the .ics file where the calendar is stored.")
    event_data: Optional[Dict[str, Any]] = Field(
        description=(
            "Data for the event to be created or updated. "
            "This should be a dictionary containing the following fields:\n"
            "- **title** *(str, optional)*: Title of the event (default: 'Untitled Event').\n"
            "- **start** *(str, required)*: Start time of the event in ISO 8601 format (e.g., '2025-01-24T10:00:00').\n"
            "- **end** *(str, required)*: End time of the event in ISO 8601 format (e.g., '2025-01-24T11:00:00').\n"
            "- **description** *(str, optional)*: Description of the event.\n"
            "- **location** *(str, optional)*: Location where the event will take place.\n"
            "- **attendees** *(list of str, optional)*: List of attendee email addresses (e.g., ['email1@example.com']).\n"
            "- **organizer** *(str, optional)*: Email address of the event organizer (e.g., 'organizer@example.com').\n"
        )
    )
    event_id: Optional[str] = Field(description="Unique identifier of the event. Required for 'update' and 'delete' actions. If not provided during 'create', a UUID will be generated.")



def run_tool(config: UserParameters, args: ToolParameters) -> Any:
    try:
        action = args.action
        calendar_path = args.calendar_path
        event_data = args.event_data
        event_id = args.event_id
        
        # Ensure the directory for storing the .ics file exists
        artifacts_dir = "studio/artifacts"
        if not os.path.exists(artifacts_dir):
            os.makedirs(artifacts_dir)

        # Resolve full path to the calendar file
        full_calendar_path = os.path.join(artifacts_dir, calendar_path)

        # Load existing calendar or create a new one
        if not os.path.exists(full_calendar_path):
            calendar = Calendar()
        else:
            with open(full_calendar_path, "r") as f:
                calendar = Calendar(f.read())

        # Handle the 'create' action
        if action == "create":
            if not event_data:
                return "Error: 'event_data' is required for 'create' action."

            # Validate required fields in event_data
            try:
                start = parse(event_data["start"])
                end = parse(event_data["end"])
                if start >= end:
                    return "Error: Event 'start' time must be before the 'end' time."
            except KeyError:
                return "Error: 'start' and 'end' are required in 'event_data'."
            except ValueError:
                return "Error: Invalid date format in 'start' or 'end'."

            # Generate unique ID for the event if not provided
            event_id = event_id or str(uuid.uuid4())
            event = Event(
                name=event_data.get("title", "Untitled Event"),
                begin=event_data["start"],
                end=event_data["end"],
                description=event_data.get("description", ""),
                location=event_data.get("location", ""),
                uid=event_id
            )

            # Add attendees to the event
            if "attendees" in event_data:
                for attendee in event_data["attendees"]:
                    event.extra.append(("ATTENDEE", f"mailto:{attendee}"))

            # Add organizer to the event
            if "organizer" in event_data:
                event.extra.append(("ORGANIZER", f"mailto:{event_data['organizer']}"))

            # Add the event to the calendar
            calendar.events.add(event)
            with open(full_calendar_path, "w") as f:
                f.writelines(calendar.serialize_iter())
            return f"Event '{event.name}' created successfully with ID '{event_id}'."

        # Handle the 'update' action
        elif action == "update":
            if not event_id:
                return "Error: 'event_id' is required for 'update' action."
            if not event_data:
                return "Error: 'event_data' is required for 'update' action."

            updated = False
            for event in calendar.events:
                if event.uid == event_id:
                    # Update event fields if present in event_data
                    if "title" in event_data:
                        event.name = event_data["title"]
                    if "start" in event_data:
                        event.begin = parse(event_data["start"])
                    if "end" in event_data:
                        event.end = parse(event_data["end"])
                    if "description" in event_data:
                        event.description = event_data["description"]
                    if "location" in event_data:
                        event.location = event_data["location"]

                    # Update attendees
                    if "attendees" in event_data:
                        event.extra = [(k, v) for k, v in event.extra if k != "ATTENDEE"]
                        for attendee in event_data["attendees"]:
                            event.extra.append(("ATTENDEE", f"mailto:{attendee}"))

                    # Update organizer
                    if "organizer" in event_data:
                        event.extra = [(k, v) for k, v in event.extra if k != "ORGANIZER"]
                        event.extra.append(("ORGANIZER", f"mailto:{event_data['organizer']}"))

                    updated = True
                    break

            if updated:
                with open(full_calendar_path, "w") as f:
                    f.writelines(calendar.serialize_iter())
                return f"Event with ID '{event_id}' updated successfully."
            else:
                return f"Error: Event with ID '{event_id}' not found."

        # Handle the 'delete' action
        elif action == "delete":
            if not event_id:
                return "Error: 'event_id' is required for 'delete' action."

            deleted = False
            for event in list(calendar.events):
                if event.uid == event_id:
                    calendar.events.remove(event)
                    deleted = True
                    break

            if deleted:
                with open(full_calendar_path, "w") as f:
                    f.writelines(calendar.serialize_iter())
                return f"Event with ID '{event_id}' deleted successfully."
            else:
                return f"Error: Event with ID '{event_id}' not found."

        else:
            return "Error: Unsupported action type."

    except Exception as e:
        return f"Failed to perform {action} action: {str(e)}"


OUTPUT_KEY="tool_output"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-params", required=True, help="JSON string for tool configuration")
    parser.add_argument("--tool-params", required=True, help="JSON string for tool arguments")
    args = parser.parse_args()
    
    # Parse JSON into dictionaries
    config_dict = json.loads(args.user_params)
    params_dict = json.loads(args.tool_params)
    
    # Validate dictionaries against Pydantic models
    config = UserParameters(**config_dict)
    params = ToolParameters(**params_dict)

    output = run_tool(config, params)
    print(OUTPUT_KEY, output)

