import { useEffect, useMemo, useState, useCallback } from 'react';
import { useGetAssetDataQuery } from '../crossCuttingApi';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';

export const useImageAssetsData = (uris: (string | undefined)[]) => {
  const [imageData, setImageData] = useState<{ [key: string]: string }>({});
  const [workflowRenderModeError, setWorkflowRenderModeError] = useState(false);

  const { data: workflowData } = useGetWorkflowDataQuery();
  const renderMode = workflowData?.renderMode;
  const workflowModelUrl = workflowData?.workflowModelUrl;

  // Get unique, non-empty image URIs
  const urisToFetch = useMemo(
    () => Array.from(new Set(uris.filter((uri): uri is string => !!uri))),
    [uris],
  );

  // Handle workflow mode data fetching
  const fetchDataForWorkflowRenderMode = useCallback(async () => {
    if (renderMode === 'workflow' && workflowModelUrl && urisToFetch.length > 0) {
      // Only attempt to fetch if we haven't already fetched the URIs
      const urisToActuallyFetch = urisToFetch.filter((uri) => !imageData[uri]);
      if (urisToActuallyFetch.length === 0) {
        return;
      }

      try {
        setWorkflowRenderModeError(false);
        const response = await fetch(workflowModelUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            request: {
              action_type: 'get-asset-data',
              get_asset_data_inputs: urisToActuallyFetch,
            },
          }),
        });
        const responseData = (await response.json()) as any;
        const asset_data = responseData.response?.asset_data;
        if (asset_data) {
          setImageData((prevData) => ({
            ...prevData,
            ...Object.fromEntries(
              Object.entries(asset_data).map(([uri, data]) => {
                const imageType = uri.toLowerCase().endsWith('.png')
                  ? 'png'
                  : uri.toLowerCase().endsWith('.jpg') || uri.toLowerCase().endsWith('.jpeg')
                    ? 'jpeg'
                    : 'png';
                return [uri, `data:image/${imageType};base64,${data}`];
              }),
            ),
          }));
        }
      } catch (error) {
        console.error('Error fetching workflow assets:', error);
        setWorkflowRenderModeError(true);
      }
    }
  }, [urisToFetch]);

  useEffect(() => {
    fetchDataForWorkflowRenderMode();
  }, [fetchDataForWorkflowRenderMode]);

  // Handle studio mode data fetching
  // Use the query hook with skip option if no URIs to fetch and in studio mode
  const {
    data: assetData,
    isError: studioRenderModeError,
    refetch: refetchStudioRenderMode,
  } = useGetAssetDataQuery(
    { asset_uri_list: urisToFetch },
    { skip: urisToFetch.length === 0 || renderMode === 'workflow' },
  );

  // Process studio mode image data when it arrives
  useEffect(() => {
    if (renderMode === 'studio' && assetData?.asset_data) {
      const newImageData: { [key: string]: string } = {};
      Object.entries(assetData.asset_data).forEach(([uri, data]) => {
        const imageType = uri.toLowerCase().endsWith('.png')
          ? 'png'
          : uri.toLowerCase().endsWith('.jpg') || uri.toLowerCase().endsWith('.jpeg')
            ? 'jpeg'
            : 'png';
        newImageData[uri] =
          `data:image/${imageType};base64,${Buffer.from(data).toString('base64')}`;
      });
      setImageData(newImageData);
    }
  }, [assetData]);

  const isError = renderMode === 'studio' ? studioRenderModeError : workflowRenderModeError;
  const refetch =
    renderMode === 'studio' ? refetchStudioRenderMode : fetchDataForWorkflowRenderMode;

  return { imageData, isError, refetch };
};
