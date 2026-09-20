export interface OperationsOverview {
  generatedAt: number;
  roomDirectory: {
    listedRooms: number;
    staleRooms: number;
    oldestUpdatedAt: number | null;
  };
  playtestEvents: {
    count: number;
    oldestCreatedAt: number | null;
  };
  matches: {
    abandonedLast7Days: number;
  };
  errors: {
    last24Hours: number;
    last7Days: number;
    latestAt: number | null;
    recent: readonly {
      source: string;
      message: string;
      route: string | null;
      roomCode: string | null;
      createdAt: number;
    }[];
  };
  lastMaintenance: {
    ranAt: number;
    deletedRooms: number;
    deletedEvents: number;
    deletedErrors: number;
    dryRun: boolean;
  } | null;
  retention: {
    staleRoomHours: number;
    playtestEventDays: number;
    errorDays: number;
  };
}

export interface MaintenanceResult {
  ranAt: number;
  dryRun: boolean;
  deletedRooms: number;
  deletedEvents: number;
  deletedErrors: number;
}
