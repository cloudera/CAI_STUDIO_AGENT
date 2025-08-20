#!/bin/bash

# High-frequency resource monitoring script
# Usage: ./bin/monitor-resources.sh [output_file] [interval_seconds]

OUTPUT_FILE=monitor.log
INTERVAL=${1:-0.1}  # Default 0.5 second intervals for high-frequency monitoring
DURATION=${2:-300}  # Default 5 minutes of monitoring

echo "Starting high-frequency resource monitoring..."
echo "Output file: $OUTPUT_FILE"
echo "Interval: ${INTERVAL}s"
echo "Duration: ${DURATION}s"
echo "========================================"

# Create header
echo "timestamp,elapsed_time,cpu_percent,mem_used_mb,mem_percent,npm_cpu,npm_mem_mb,node_cpu,node_mem_mb,next_cpu,next_mem_mb,grpc_cpu,grpc_mem_mb" > "$OUTPUT_FILE"

# Function to get process stats - very specific to our started processes
get_process_stats() {
    local process_name=$1
    local stats=""
    
    case "$process_name" in
        "npm")
            # Only npm processes, not node processes running npm
            stats=$(ps aux | grep -E "npm.*run.*dev|npm.*start" | grep -v grep | awk '{cpu+=$3; mem+=$6} END {printf "%.1f,%.1f", cpu, mem/1024}')
            ;;
        "node")
            # Only node processes running next, exclude cursor/vscode
            stats=$(ps aux | grep -E "node.*next.*dev|node.*\.bin/next" | grep -v grep | grep -v cursor | grep -v vscode | awk '{cpu+=$3; mem+=$6} END {printf "%.1f,%.1f", cpu, mem/1024}')
            ;;
        "next")
            # Processes with 'next' in command line, exclude cursor/vscode  
            stats=$(ps aux | grep "next" | grep -v grep | grep -v cursor | grep -v vscode | awk '{cpu+=$3; mem+=$6} END {printf "%.1f,%.1f", cpu, mem/1024}')
            ;;
        "grpc")
            # Our specific gRPC server process
            stats=$(ps aux | grep "start-grpc-server.py" | grep -v grep | awk '{cpu+=$3; mem+=$6} END {printf "%.1f,%.1f", cpu, mem/1024}')
            ;;
    esac
    
    if [ -z "$stats" ] || [ "$stats" = "," ]; then
        echo "0.0,0.0"
    else
        echo "$stats"
    fi
}

# Function to get system stats (ultra-optimized for speed)
get_system_stats() {
    # CPU usage - instantaneous from /proc/loadavg (much faster than calculating)
    local cpu_percent=$(awk '{printf "%.1f", $1*100/12}' /proc/loadavg)  # Assuming 12 cores, adjust if needed
    
    # Memory stats - single optimized call
    local mem_stats=$(awk '/^MemTotal:|^MemAvailable:/ {if($1=="MemTotal:") total=$2; if($1=="MemAvailable:") avail=$2} END {used=(total-avail)/1024; percent=used*100*1024/total; printf "%.0f,%.1f", used, percent}' /proc/meminfo)
    
    echo "${cpu_percent},${mem_stats}"
}

# Start monitoring
echo "Monitoring started at $(date)"
start_time=$(date +%s.%3N 2>/dev/null || date +%s)

while true; do
    current_time_int=$(date +%s)
    start_time_int=${start_time%.*}  # Remove decimal part for integer comparison
    elapsed=$((current_time_int - start_time_int))
    
    if [ $elapsed -gt $DURATION ]; then
        echo "Monitoring duration reached. Stopping."
        break
    fi
    
    # High precision timestamp and elapsed time
    timestamp=$(date '+%Y-%m-%d %H:%M:%S.%3N')
    current_time_ms=$(date +%s.%3N 2>/dev/null || date +%s)
    elapsed_ms=$(awk "BEGIN {printf \"%.3f\", $current_time_ms - $start_time}")
    
    # Get system stats (optimized)
    system_stats=$(get_system_stats)
    
    # Get process-specific stats (sequential for reliability)
    npm_stats=$(get_process_stats "npm")
    node_stats=$(get_process_stats "node")
    next_stats=$(get_process_stats "next")
    grpc_stats=$(get_process_stats "grpc")
    
    # Write to log - streamlined format
    echo "${timestamp},${elapsed_ms},${system_stats},${npm_stats},${node_stats},${next_stats},${grpc_stats}" >> "$OUTPUT_FILE"
    
    sleep $INTERVAL
done

echo "Monitoring completed. Results saved to: $OUTPUT_FILE"
echo "========================================"
echo "Quick analysis:"

# Get monitoring duration
duration=$(tail -n 1 "$OUTPUT_FILE" | awk -F',' '{print $2}')
samples=$(tail -n +2 "$OUTPUT_FILE" | wc -l)
echo "Monitoring duration: ${duration} seconds"
echo "Total samples: $samples"
echo "Average sampling rate: $(echo "scale=3; $duration / $samples" | bc 2>/dev/null || echo "N/A") seconds per sample"

echo ""
echo "Peak memory usage:"
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($4>max) max=$4} END {printf "  System: %.0f MB\n", max}'
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($7>max) max=$7} END {printf "  npm processes: %.1f MB\n", max}'
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($9>max) max=$9} END {printf "  node processes: %.1f MB\n", max}'
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($11>max) max=$11} END {printf "  next processes: %.1f MB\n", max}'
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($13>max) max=$13} END {printf "  grpc processes: %.1f MB\n", max}'

echo ""
echo "Peak CPU usage:"
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($3>max) max=$3} END {printf "  System: %.1f%%\n", max}'
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($6>max) max=$6} END {printf "  npm processes: %.1f%%\n", max}'
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($8>max) max=$8} END {printf "  node processes: %.1f%%\n", max}'
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($10>max) max=$10} END {printf "  next processes: %.1f%%\n", max}'
tail -n +2 "$OUTPUT_FILE" | awk -F',' '{if($12>max) max=$12} END {printf "  grpc processes: %.1f%%\n", max}'
