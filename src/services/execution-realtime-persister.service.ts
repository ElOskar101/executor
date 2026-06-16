import { ExecutionLogEvent, ExecutionStatusEvent } from "../types/realtime.type";
import { createExecutionStatusPersister } from "./execution-status-persister.service";
import { createExecutionLogPersister } from "./execution-log-persister.service";

/**
 * Combined persister that handles both log and status events from Redis.
 * Acts as a facade to route events to specific persisters.
 * Used by socket-server when receiving events from the runner.
 */

export interface ExecutionRealtimePersister {
  persistLogEvent(event: ExecutionLogEvent): Promise<void>;
  persistStatusEvent(event: ExecutionStatusEvent): Promise<void>;
}

class CombinedExecutionRealtimePersister implements ExecutionRealtimePersister {
  private statusPersister = createExecutionStatusPersister();
  private logPersister = createExecutionLogPersister();

  async persistLogEvent(event: ExecutionLogEvent) {
    return this.logPersister.handleLogEvent(event);
  }

  async persistStatusEvent(event: ExecutionStatusEvent) {
    return this.statusPersister.handleStatusEvent(event);
  }
}

export function createExecutionRealtimePersister(): ExecutionRealtimePersister {
  return new CombinedExecutionRealtimePersister();
}

