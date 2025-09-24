from typing import Optional

from studio.db.model import Base

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from contextlib import contextmanager
from studio.consts import DEFAULT_SQLITE_DB_LOCATION
import os


def get_sqlite_db_location():
    """
    Get the location of the currently loaded state file.
    """
    if os.environ.get("AGENT_STUDIO_SQLITE_DB"):
        return os.environ.get("AGENT_STUDIO_SQLITE_DB")
    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    app_data_dir = os.getenv("APP_DATA_DIR", "/home/cdsw/agent-studio") if is_composable else "/home/cdsw"
    return os.path.join(app_data_dir, DEFAULT_SQLITE_DB_LOCATION)


def delete_database() -> None:
    """
    Delete the currently existing database. Note that this only deletes
    the baseline database, and doesn't delete any of the actual content
    generate from studio (i.e., if an adapter was trained using Studio and this
    method is ran, the metadata table row of the adapter is removed from the
    database, but the actual database entry itself)
    """

    state_db = get_sqlite_db_location()
    os.remove(state_db)
    return


class AgentStudioDao():
    """
    Data access layer for the Fine Tuning Studio application. In the future,
    this should be abstracted out to a base DAO class with different implementations
    depending on the underlying SQL engine, if necessary. However given that we don't
    yet know the necessary level of abstraction, we will air on the side of code
    simplicity and not build the base class yet.
    """

    def __init__(self, engine_url: Optional[str] = None, echo: bool = False, engine_args: dict = {}):
        if engine_url is None:
            engine_url = f"sqlite+pysqlite:///{get_sqlite_db_location()}"

        self.engine = create_engine(
            engine_url,
            echo=echo,
            **engine_args,
        )
        self.Session = sessionmaker(
            bind=self.engine, autoflush=True, autocommit=False)

        # Create all of our required tables if they do not yet exist.
        Base.metadata.create_all(self.engine)

    @contextmanager
    def get_session(self):
        """
        Provides a context manager for a session that automatically
        attempts a session commit after completion of the context, and will
        automatically rollback if there are failures, and finally will close
        the session once complete, releasing the sesion back to the session pool.
        """
        session = self.Session()
        try:
            yield session
            session.commit()  # Commit on successful operation
        except Exception as e:
            session.rollback()  # Rollback in case of error
            raise e
        finally:
            session.close()

def get_dao():
    return AgentStudioDao(
        engine_args={
            "pool_size": 5,
            "max_overflow": 10,
            "pool_timeout": 30,
            "pool_recycle": 1800,
        }
    )
