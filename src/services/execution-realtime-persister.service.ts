import { ExecutionLogEvent, ExecutionStatusEvent } from "../types/realtime.type";
import { createExecutionStatusPersister } from "./execution-status-persister.service";
import { createExecutionLogPersister } from "./execution-log-persister.service";
import { persistRowAuditStatus, RowAuditStatus } from "./row-audit-status-persister.service";

/**
 * Routes execution logs and status events and row-audit status updates to their persisters.
 */

export interface ExecutionRealtimePersister {
  persistLogEvent(event: ExecutionLogEvent): Promise<void>;
  persistStatusEvent(event: ExecutionStatusEvent): Promise<void>;
  persistRowAuditStatus(rowAuditId: string, status: RowAuditStatus): ReturnType<typeof persistRowAuditStatus>;
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

  persistRowAuditStatus(rowAuditId: string, status: RowAuditStatus) {
    return persistRowAuditStatus(rowAuditId, status);
  }
}

export function createExecutionRealtimePersister(): ExecutionRealtimePersister {
  return new CombinedExecutionRealtimePersister();
}

