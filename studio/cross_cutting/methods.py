from typing import Iterator
from studio.cross_cutting.utils import get_random_compact_string
from studio.db.dao import AgentStudioDao
from cmlapi import CMLServiceApi
from studio.api import *
from studio.cross_cutting import utils as cc_utils
from studio import consts
import os


def health_check(
    request: HealthCheckRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> HealthCheckResponse:
    return HealthCheckResponse(message="Studio is healthy")


def non_streaming_temporary_file_upload(
    request: NonStreamingTemporaryFileUploadRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> FileUploadResponse:
    # Generate a random temporary file name with '.partfile' extension
    temp_file = f"{get_random_compact_string()}.partfile"
    output_dir = consts.TEMP_FILES_LOCATION

    # Ensure the output directory for temporary files exists
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    if not request.file_name:
        raise ValueError("File name is required")

    temp_temp_path = os.path.join(output_dir, temp_file)

    try:
        # Open the temporary file in write-binary mode
        with open(temp_temp_path, "wb") as f:
            f.write(request.full_content)
            print(
                f"Processing file upload: file_name={request.file_name}, content_length={len(request.full_content) if request.full_content else 0}"
            )

        # Construct the final temporary file path with a prefix
        actual_temp_path = os.path.join(output_dir, f"{cc_utils.get_prefix_for_temporary_file()}{request.file_name}")

        # Rename the temporary file to its final name
        os.rename(temp_temp_path, actual_temp_path)

        return FileUploadResponse(message="File uploaded successfully", file_path=actual_temp_path)

    except Exception as e:
        raise RuntimeError(f"Failed to upload file: {str(e)}")
    finally:
        # Clean up the temporary file if it exists
        if os.path.exists(temp_temp_path):
            os.remove(temp_temp_path)


def temporary_file_upload(req_iterator: Iterator[FileChunk], dao: AgentStudioDao = None) -> FileUploadResponse:
    """
    Upload a file chunk to a temporary location with proper error handling.

    Args:
        req_iterator (Iterator[FileChunk]): An iterator that provides chunks of the file to upload.
        dao (AgentStudioDao, optional): Data access object for interacting with the database (currently unused).

    Returns:
        FileUploadResponse: A response object containing the upload status and temporary file path.

    Raises:
        RuntimeError: If file upload fails due to any exception.
    """
    # Generate a random temporary file name with '.partfile' extension
    temp_file = f"{get_random_compact_string()}.partfile"
    output_dir = consts.TEMP_FILES_LOCATION

    # Ensure the output directory for temporary files exists
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    actual_file_name = None  # Placeholder for the actual file name extracted from the chunks
    # Path for the temporary file
    temp_temp_path = os.path.join(output_dir, temp_file)

    try:
        # Open the temporary file in write-binary mode
        with open(temp_temp_path, "wb") as f:
            for chunk in req_iterator:
                print(
                    f"Processing chunk: file_name={chunk.file_name}, content_length={len(chunk.content) if chunk.content else 0}"
                )

                # Set the actual file name only once from the first valid chunk
                actual_file_name = actual_file_name or os.path.basename(chunk.file_name)
                if chunk.content:
                    f.write(chunk.content)
                if chunk.is_last_chunk:
                    break

        # Raise an error if no valid file name was found in the chunks
        if not actual_file_name:
            raise ValueError("No valid file name found in the request iterator.")

        # Construct the final temporary file path with a prefix
        actual_temp_path = os.path.join(output_dir, f"{cc_utils.get_prefix_for_temporary_file()}{actual_file_name}")
        # Rename the temporary file to the final temporary file name
        os.rename(temp_temp_path, actual_temp_path)

        # Return a success response with the path to the uploaded file
        return FileUploadResponse(
            message="File uploaded successfully to a temporary location.",
            file_path=actual_temp_path,
        )
    except Exception as e:
        # Handle any exceptions that occur during the upload process
        raise RuntimeError(f"Failed to upload file: {str(e)}")
    finally:
        # Ensure temporary file is removed if an error occurs
        if os.path.exists(temp_temp_path):
            os.remove(temp_temp_path)


def download_temporary_file(
    request: DownloadTemporaryFileRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> Iterator[FileChunk]:
    """
    Download a file from a temporary location, streaming it in chunks.

    Args:
        request (DownloadTemporaryFileRequest): Request containing the path of the file to download.
        chunk_size (int, optional): Size of each chunk in bytes. Defaults to 1MB.

    Yields:
        FileChunk: Generator yielding chunks of the file with metadata.

    Raises:
        FileNotFoundError: If the requested file doesn't exist.
        PermissionError: If there are insufficient permissions to read the file.
        RuntimeError: If file download fails due to any other exception.
    """
    download_chunk_size: int = 1024 * 1024
    file_path = request.file_path

    try:
        # Verify the file exists
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Temporary file not found: {file_path}")

        # Verify the file is within the temporary files location
        if not os.path.abspath(file_path).startswith(os.path.abspath(consts.TEMP_FILES_LOCATION)):
            raise ValueError(f"Invalid file path: {file_path}. Must be within temporary files location.")

        # Get the base filename without any temporary prefix
        file_name = os.path.basename(file_path)

        # Open and read the file in binary mode
        with open(file_path, "rb") as f:
            while True:
                # Read a chunk of the specified size
                chunk_content = f.read(download_chunk_size)

                # If we've reached EOF, break
                if not chunk_content:
                    break

                # Read the next chunk to check if this is the last one
                next_chunk = f.read(1)
                # Seek back if we read a byte
                if next_chunk:
                    f.seek(-1, 1)

                # Yield the current chunk with metadata
                yield FileChunk(content=chunk_content, file_name=file_name, is_last_chunk=not bool(next_chunk))

        # Delete the temporary file after all chunks are transferred
        os.remove(file_path)

    except FileNotFoundError:
        raise  # Re-raise file not found errors
    except PermissionError:
        raise  # Re-raise permission errors
    except Exception as e:
        # Handle any other exceptions that occur during the download process
        raise RuntimeError(f"Failed to download file: {str(e)}")


def get_asset_data(
    request: GetAssetDataRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> GetAssetDataResponse:
    unavailable_assets = list()
    asset_data = dict()
    for asset_uri in list(set(request.asset_uri_list or [])):
        asset_path = os.path.join(consts.DYNAMIC_ASSETS_LOCATION, asset_uri)
        if not os.path.exists(asset_path):
            unavailable_assets.append(asset_uri)
            continue
        with open(asset_path, "rb") as asset_file:
            asset_data[asset_uri] = asset_file.read()

    return GetAssetDataResponse(asset_data=asset_data, unavailable_assets=unavailable_assets)


def get_parent_project_details(
    request: GetParentProjectDetailsRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> GetParentProjectDetailsResponse:
    scheme = cc_utils.get_url_scheme()
    domain = os.getenv("CDSW_DOMAIN")
    project = os.getenv("CDSW_PROJECT")
    owner = os.getenv("PROJECT_OWNER")
    project_base = f"{scheme}://{domain}/{owner}/{project}/"
    return GetParentProjectDetailsResponse(
        project_base=project_base, studio_subdirectory=cc_utils.get_studio_subdirectory()
    )
