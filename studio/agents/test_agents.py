from sqlalchemy.exc import SQLAlchemyError
from studio.db.dao import AgentStudioDao
from studio.api import *
from cmlapi import CMLServiceApi
from studio.db import model as db_model
from crewai import Task, Crew
from studio.agents.utils import get_crewai_agent_instance
from studio.agents.agent import get_agent

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src")

from engine.crewai.tracing import instrument_crewai_workflow, reset_crewai_instrumentation


def agent_test(request: TestAgentRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None) -> TestAgentResponse:
    """
    Test an agent based on the request parameters.
    """
    raise ValueError("Functionality is currently disabled.")
    try:
        with dao.get_session() as session:
            agent_id = request.agent_id

            # Check if the agent ID belongs to a studio agent
            studio_agent = session.query(db_model.Agent).filter(db_model.Agent.id == agent_id).first()
            if studio_agent:
                return studio_agent_test(request, cml, dao)

            # Raise an error if the agent ID is not found in either table
            raise ValueError(f"Agent ID '{agent_id}' not found in studio agents.")

    except ValueError as e:
        raise RuntimeError(f"Validation error: {e}")
    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error while testing agent: {e}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error while testing agent: {e}")


def extract_last_words(text: str, num_words: int) -> str:
    """
    Extract the last `num_words` from a given text.
    """
    words = text.split()
    return " ".join(words[-num_words:])


def truncate_context(context: str, max_tokens: int) -> str:
    """
    Truncate the context string to fit within the maximum token limit.
    """
    words = context.split()
    return " ".join(words[:max_tokens])


def studio_agent_test(request: TestAgentRequest, cml: CMLServiceApi, dao: AgentStudioDao) -> TestAgentResponse:
    """
    Test a studio agent.
    """
    try:
        with dao.get_session() as session:
            # Validate studio agent
            agent_response = get_agent(request=GetAgentRequest(agent_id=request.agent_id), cml=cml, dao=dao)
            if not agent_response.agent.is_valid:
                raise ValueError(
                    f"Studio agent with ID '{request.agent_id}' is invalid. "
                    "Ensure the associated tools and LLM model are valid."
                )

            # Retrieve the agent instance
            try:
                reset_crewai_instrumentation()
                instrument_crewai_workflow(f"Test Agents - {agent_response.agent.name}")
            except Exception as e:
                pass

            agent_ins = get_crewai_agent_instance(request.agent_id, session)

            # Extract the last 100 words from the context
            last_message = extract_last_words(request.context, 50)

            # Base descriptions and token calculations
            user_input_tokens = len(request.user_input.split())
            last_message_tokens = len(last_message.split())
            static_description_tokens = len(
                f"User Input:\n'{request.user_input}'\nLast Message:\n'{last_message}'\nConversation History:\n".split()
            )
            task_prompt_tokens = len(
                (
                    "Your task is to analyze the last 100 words from the input in the context "
                    "to the last response you provided. First, determine the user intent based "
                    "on their input. Then, review your last response to identify if any specific "
                    "user action or information was expected. If an expected user action aligns "
                    "with the details provided in the user's input, respond appropriately to fulfill "
                    "the user's intent or continue the expected process. Maintain continuity and "
                    "relevance by leveraging both the user's input and the full context of the "
                    "conversation history."
                ).split()
            )

            # Calculate available tokens for the truncated context
            max_context_tokens = 1024 - (
                user_input_tokens + last_message_tokens + static_description_tokens + task_prompt_tokens
            )
            truncated_context = truncate_context(request.context, max_context_tokens)

            # Updated task description
            task_description = (
                f"User Input:\n'{request.user_input}'\n"
                f"Last Message:\n'{last_message}'\n"
                f"Conversation History:\n{truncated_context}\n\n"
                f"First analyze the last message given to you and detrmine if certain user action was to be expected."
                f"If yes, then for the given user input given the appropriate response."
                f"If no, the just provide the correct response."
                f"Maintain continuity and relevance by leveraging both "
                f"the user's input and the full context of the conversation history."
            )

            expected_output = "Provide the correct response and try it be visually appealing."

            # Create the task and crew
            task = Task(
                description=task_description,
                agent=agent_ins,
                expected_output=expected_output,
                tools=agent_ins.tools,
            )
            crew = Crew(agents=[agent_ins], tasks=[task], verbose=True)

            # Execute the task
            output = crew.kickoff()

            # Return the response
            raw_output = str(output.raw)
            return TestAgentResponse(response=raw_output)

    except ValueError as e:
        raise RuntimeError(f"Validation error: {e}")
    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error while testing studio agent: {e}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error while testing studio agent: {e}")
