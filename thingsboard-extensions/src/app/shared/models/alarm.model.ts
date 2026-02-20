///
/// Industrial Historian - Alarm Models
///

export enum AlarmSeverity {
  CRITICAL = 'CRITICAL',
  MAJOR = 'MAJOR',
  MINOR = 'MINOR',
  WARNING = 'WARNING',
  INDETERMINATE = 'INDETERMINATE'
}

export enum AlarmStatus {
  ACTIVE_UNACK = 'ACTIVE_UNACK',
  ACTIVE_ACK = 'ACTIVE_ACK',
  CLEARED_UNACK = 'CLEARED_UNACK',
  CLEARED_ACK = 'CLEARED_ACK'
}

export interface AlarmDetails {
  PV?: number;
  SP?: number;
  deviation?: number;
  rate?: number;
  [key: string]: any;
}

export interface HistorianAlarm {
  id: string;
  type: string;
  severity: AlarmSeverity;
  status: AlarmStatus;
  startTs: number;
  endTs?: number;
  originatorId: string;
  originatorName: string;
  details?: AlarmDetails;
}
