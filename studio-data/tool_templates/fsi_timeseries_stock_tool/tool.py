from typing import Type, List
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool
from textwrap import dedent

import json
import argparse
import yfinance as yf
import pandas as pd


class UserParameters(BaseModel):
    pass

class ToolParameters(BaseModel):
    tickers_list: List[str] = Field(description="List of stock tickers to pull from the web")


def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    tickers_list = args.tickers_list
    
    all_time_series = {}
    all_time_series_status = {}
    # Get stock data for each ticker
    for ticker in tickers_list:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="3y")
        # Extract dates and closing prices
        if not hist.empty:
            dates = hist.index.strftime('%Y-%m-%d').tolist()
            prices = hist['Close'].tolist()
            
            # Convert to DataFrame with date as index and prices as columns
            df = pd.DataFrame(prices, index=dates, columns=[ticker])
            
            # Merge with existing DataFrame
            if 'all_time_series_df' in locals():
                all_time_series_df = all_time_series_df.merge(df, how='outer', left_index=True, right_index=True)
            else:
                all_time_series_df = df
            all_time_series_status[ticker] = "Data Lookup complete"
        else:
            all_time_series_status[ticker] = "No history found"
    all_time_series_df.index = pd.to_datetime(all_time_series_df.index)
    all_time_series_df.to_csv('/tmp/ts.csv', index=True)
    return  all_time_series_status


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

    output = run_tool(
        config,
        params
    )
    print(OUTPUT_KEY, output)
