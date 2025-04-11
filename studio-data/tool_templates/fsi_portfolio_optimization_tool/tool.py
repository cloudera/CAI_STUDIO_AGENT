from typing import Type, List
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool
from textwrap import dedent

import json
import argparse 
import numpy as np
import pandas as pd
from scipy.optimize import minimize


class UserParameters(BaseModel):
    pass

class ToolParameters(BaseModel):
    max_drawdown: float = Field(description="The maximum acceptable drawdown for the portfolio, as a fraction from 0.0 to 1.0")
    stocks_ticker: List[str] = Field(description="List of stock ticker symbols")
    amount: int = Field(description="The total amount of the portfolio, in integer value")


def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    max_drawdown = args.max_drawdown
    stocks_ticker = args.stocks_ticker 
    amount = args.amount

    time_series = pd.read_csv('/tmp/ts.csv')
    time_series = time_series.loc[:,~time_series.columns.str.contains('^Unnamed')]
    time_series = time_series.astype('int64') 
    stocks_ticker =time_series.columns
    num_stocks = len(stocks_ticker)
    weights = 1.0 / num_stocks
    weights = mpt(ts=time_series)
    print(weights)
    # Create portfolio with equal weights
    optimized_portfolio = {
        "recommended_allocation": {
            stock: float(weights[i]) for i, stock in enumerate(stocks_ticker)
        },
        "max_drawdown": max_drawdown
    }
    print(optimized_portfolio)
    
    # Compute the backtest for the weight of the stock together
    backtest = (time_series.pct_change() + 1).cumprod()

    backtest = backtest.multiply(optimized_portfolio["recommended_allocation"], axis=1).multiply(amount)
    backtest.to_csv('/tmp/backtest-ts.csv', index=True)
    # optimized_portfolio["backtest"] = backtest
    temp =backtest.sum(axis=1)
    peak = temp.expanding(min_periods=1).max()
    drawdown = (temp - peak) / peak
    max_drawdown = drawdown.min()
    optimized_portfolio["max_drawdown"] = max_drawdown
    # optimized_portfolio["1-yearbacktest"] = backtest.sum(axis=1).iloc[-1:]
    # print(optimized_portfolio["1-yearbacktest"] )
    
    return optimized_portfolio


def mpt(ts: pd.DataFrame) -> np.ndarray:
    # Use expectation variance to derive the weights of the portfolio
    expected_returns = ts.pct_change().mean()
    cov_matrix = ts.pct_change().cov()

    # Define the function to minimize (negative Sharpe Ratio)
    def neg_sharpe_ratio(weights):
        portfolio_return = np.sum(weights * expected_returns) * 252
        portfolio_std_dev = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights))) * np.sqrt(252)
        sharpe_ratio = portfolio_return / portfolio_std_dev
        return -sharpe_ratio

    # Define the constraints
    n = ts.shape[1]
    weights_init = np.array([1.0 / n] * n)
    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
    bounds = tuple((0, 1) for x in range(n))

    # Minimize the negative Sharpe Ratio
    result = minimize(neg_sharpe_ratio, weights_init, method='SLSQP', bounds=bounds, constraints=constraints)

    # Get the optimized weights
    optimized_weights = result.x

    return optimized_weights



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