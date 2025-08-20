import os
os.environ["MPLBACKEND"] = "Agg"  # or set env var when running
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime
import numpy as np

# Load CSV
df = pd.read_csv("monitor.log")

# Convert timestamp to datetime - we now have elapsed_time column directly
df['timestamp'] = pd.to_datetime(df['timestamp'])
# Use the elapsed_time column directly (already in seconds)
df['relative_time'] = df['elapsed_time']

# Create a comprehensive multi-subplot figure
fig, axes = plt.subplots(2, 2, figsize=(16, 12))
fig.suptitle('System Resource Monitor - All Metrics', fontsize=16, fontweight='bold')

# Plot 1: System CPU and Memory
ax1 = axes[0, 0]
ax1.plot(df['relative_time'], df['cpu_percent'], 'r-', label='CPU %', linewidth=2)
ax1.plot(df['relative_time'], df['mem_percent'], 'b-', label='Memory %', linewidth=2)
ax1.set_title('System CPU & Memory Usage (%)')
ax1.set_ylabel('Percentage')
ax1.legend()
ax1.grid(True, alpha=0.3)

# Plot 2: Process CPU Usage
ax2 = axes[0, 1]
ax2.plot(df['relative_time'], df['npm_cpu'], 'purple', label='npm CPU %', linewidth=2)
ax2.plot(df['relative_time'], df['node_cpu'], 'red', label='node CPU %', linewidth=2)
ax2.plot(df['relative_time'], df['next_cpu'], 'blue', label='next CPU %', linewidth=2)
ax2.plot(df['relative_time'], df['grpc_cpu'], 'orange', label='grpc CPU %', linewidth=2)
ax2.set_title('Process CPU Usage (%)')
ax2.set_ylabel('CPU %')
ax2.legend()
ax2.grid(True, alpha=0.3)

# Plot 3: Process Memory Usage (MB)
ax3 = axes[1, 0]
ax3.plot(df['relative_time'], df['npm_mem_mb'], 'purple', label='npm Memory (MB)', linewidth=2)
ax3.plot(df['relative_time'], df['node_mem_mb'], 'red', label='node Memory (MB)', linewidth=2)
ax3.plot(df['relative_time'], df['next_mem_mb'], 'blue', label='next Memory (MB)', linewidth=2)
ax3.plot(df['relative_time'], df['grpc_mem_mb'], 'orange', label='grpc Memory (MB)', linewidth=2)
ax3.set_title('Process Memory Usage (MB)')
ax3.set_ylabel('MB')
ax3.legend()
ax3.grid(True, alpha=0.3)

# Plot 4: Combined Process vs System Resource Usage
ax4 = axes[1, 1]
# Calculate total process resource usage
total_process_cpu = df['npm_cpu'] + df['node_cpu'] + df['next_cpu'] + df['grpc_cpu']
total_process_mem = df['npm_mem_mb'] + df['node_mem_mb'] + df['next_mem_mb'] + df['grpc_mem_mb']
ax4.plot(df['relative_time'], total_process_cpu, 'red', label='Total Process CPU %', linewidth=2)
ax4_twin = ax4.twinx()
ax4_twin.plot(df['relative_time'], total_process_mem, 'blue', label='Total Process Memory (MB)', linewidth=2)
ax4_twin.plot(df['relative_time'], df['mem_used_mb'], 'green', label='Total System Memory (MB)', linewidth=2)
ax4.set_title('Process vs System Resource Usage')
ax4.set_ylabel('CPU %', color='red')
ax4_twin.set_ylabel('Memory (MB)', color='blue')
ax4.tick_params(axis='y', labelcolor='red')
ax4_twin.tick_params(axis='y', labelcolor='blue')
# Add legend for the twin axis
ax4_twin.legend(loc='upper left')
ax4.grid(True, alpha=0.3)

# Set x-label for bottom plots
for ax in [axes[1, 0], axes[1, 1]]:
    ax.set_xlabel('Time (seconds since start)')

# Adjust layout and save
plt.tight_layout()
plt.savefig("plot.png", dpi=300, bbox_inches='tight')
print(f"Plot saved to plot.png")
print(f"Monitoring duration: {df['relative_time'].iloc[-1]:.1f} seconds")
print(f"Data points: {len(df)}")
print(f"Sampling rate: ~{df['relative_time'].iloc[-1]/len(df):.2f} seconds per sample")
